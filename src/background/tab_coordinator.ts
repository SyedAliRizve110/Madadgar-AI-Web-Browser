/**
 * Madadgar - Multi-Tab Errand Coordinator & State Pool (Task 7.1)
 * Programmatically spawns, tracks, monitors, and isolates messaging across
 * concurrent browser tabs, safely handling manual closures without hanging.
 */

import type { ManagedTab, ManagedTabStatus } from '@/common/types';

export class TabCoordinator {
  private static managedTabs: Map<number, ManagedTab> = new Map();
  private static readyResolvers: Map<number, Array<(tab: ManagedTab) => void>> = new Map();
  private static readyRejecters: Map<number, Array<(err: Error) => void>> = new Map();
  private static isInitialized = false;

  /**
   * Initializes chrome.tabs event listeners for tab status monitoring and clean closure handling
   */
  public static init(): void {
    if (this.isInitialized || typeof chrome === 'undefined' || !chrome.tabs) {
      return;
    }

    if (chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    }

    if (chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    }

    this.isInitialized = true;
  }

  /**
   * Spawns and tracks a new managed tab
   */
  public static async openTab(
    url: string,
    options?: { active?: boolean; pinned?: boolean }
  ): Promise<ManagedTab> {
    this.init();

    if (typeof chrome === 'undefined' || !chrome.tabs?.create) {
      throw new Error('chrome.tabs API is unavailable in current runtime.');
    }

    const tab = await chrome.tabs.create({
      url,
      active: options?.active ?? false,
      pinned: options?.pinned ?? false,
    });

    const tabId = tab.id;
    if (typeof tabId !== 'number') {
      throw new Error('Failed to obtain numeric tab ID from chrome.tabs.create.');
    }

    const managed: ManagedTab = {
      tabId,
      url,
      title: tab.title || undefined,
      status: (tab.status === 'complete' ? 'ready' : 'loading') as ManagedTabStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.managedTabs.set(tabId, managed);

    // If already complete upon creation (rare but possible in mocks/instant cache)
    if (managed.status === 'ready') {
      this.resolveWaiters(tabId, managed);
    }

    return managed;
  }

  /**
   * Registers an existing open tab into the managed state pool
   */
  public static registerTab(tabId: number, url = '', title = ''): ManagedTab {
    this.init();
    const existing = this.managedTabs.get(tabId);
    if (existing) {
      return existing;
    }

    const managed: ManagedTab = {
      tabId,
      url,
      title,
      status: 'ready',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.managedTabs.set(tabId, managed);
    return managed;
  }

  /**
   * Waits for a managed tab to reach the 'ready' state (status === 'complete')
   */
  public static waitForTabReady(tabId: number, timeoutMs = 15000): Promise<ManagedTab> {
    const managed = this.managedTabs.get(tabId);
    if (!managed) {
      return Promise.reject(new Error(`Tab #${tabId} is not tracked by TabCoordinator.`));
    }

    if (managed.status === 'ready') {
      return Promise.resolve(managed);
    }

    if (managed.status === 'closed') {
      return Promise.reject(new Error(`Tab #${tabId} was closed.`));
    }

    if (managed.status === 'error') {
      return Promise.reject(new Error(managed.error || `Tab #${tabId} encountered a load error.`));
    }

    return new Promise<ManagedTab>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const onResolved = (tab: ManagedTab) => {
        if (timer) clearTimeout(timer);
        resolve(tab);
      };

      const onRejected = (err: Error) => {
        if (timer) clearTimeout(timer);
        reject(err);
      };

      if (!this.readyResolvers.has(tabId)) {
        this.readyResolvers.set(tabId, []);
      }
      this.readyResolvers.get(tabId)!.push(onResolved);

      if (!this.readyRejecters.has(tabId)) {
        this.readyRejecters.set(tabId, []);
      }
      this.readyRejecters.get(tabId)!.push(onRejected);

      timer = setTimeout(() => {
        this.cleanupWaiters(tabId, onResolved, onRejected);
        reject(new Error(`Timeout waiting for tab #${tabId} to load after ${timeoutMs}ms.`));
      }, timeoutMs);
    });
  }

  /**
   * Sends an isolated runtime message to a specific managed tab
   */
  public static async sendMessageToTab<T = any>(
    tabId: number,
    message: any,
    timeoutMs = 10000
  ): Promise<T> {
    const managed = this.managedTabs.get(tabId);
    if (managed && managed.status === 'closed') {
      throw new Error(`Cannot send message: Tab #${tabId} has already been closed.`);
    }

    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
      throw new Error('chrome.tabs.sendMessage is unavailable.');
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Message timeout to tab #${tabId} after ${timeoutMs}ms.`));
        }
      }, timeoutMs);

      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message || `Failed to communicate with tab #${tabId}`));
          } else {
            resolve(response as T);
          }
        });
      } catch (err: any) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }

  /**
   * Closes a single managed tab
   */
  public static async closeTab(tabId: number): Promise<boolean> {
    const managed = this.managedTabs.get(tabId);
    if (!managed || managed.status === 'closed') {
      return false;
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.remove) {
        await chrome.tabs.remove(tabId);
      }
      managed.status = 'closed';
      managed.updatedAt = Date.now();
      return true;
    } catch {
      managed.status = 'closed';
      return false;
    }
  }

  /**
   * Closes all currently managed tabs
   */
  public static async closeAllManagedTabs(): Promise<void> {
    const openTabIds = Array.from(this.managedTabs.values())
      .filter((t) => t.status !== 'closed')
      .map((t) => t.tabId);

    if (openTabIds.length === 0) return;

    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.remove) {
        await chrome.tabs.remove(openTabIds);
      }
    } catch {
      // Ignore errors during batch close
    } finally {
      for (const t of this.managedTabs.values()) {
        t.status = 'closed';
        t.updatedAt = Date.now();
      }
    }
  }

  /**
   * Handler for chrome.tabs.onUpdated
   */
  public static handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): void {
    const managed = this.managedTabs.get(tabId);
    if (!managed) return;

    managed.updatedAt = Date.now();

    if (tab.title) {
      managed.title = tab.title;
    }
    if (tab.url) {
      managed.url = tab.url;
    }

    if (changeInfo.status === 'complete') {
      managed.status = 'ready';
      this.resolveWaiters(tabId, managed);
    } else if (changeInfo.status === 'loading') {
      managed.status = 'loading';
    }
  }

  /**
   * Handler for chrome.tabs.onRemoved (handles manual user closure safely)
   */
  public static handleTabRemoved(tabId: number): void {
    const managed = this.managedTabs.get(tabId);
    if (!managed) return;

    managed.status = 'closed';
    managed.updatedAt = Date.now();

    // Reject any pending promises waiting for this tab to load
    const rejecters = this.readyRejecters.get(tabId);
    if (rejecters && rejecters.length > 0) {
      const err = new Error(`Tab #${tabId} was closed by the user before completing.`);
      rejecters.forEach((rej) => rej(err));
      this.readyRejecters.delete(tabId);
    }
    this.readyResolvers.delete(tabId);
  }

  private static resolveWaiters(tabId: number, tab: ManagedTab): void {
    const resolvers = this.readyResolvers.get(tabId);
    if (resolvers && resolvers.length > 0) {
      resolvers.forEach((res) => res(tab));
      this.readyResolvers.delete(tabId);
    }
    this.readyRejecters.delete(tabId);
  }

  private static cleanupWaiters(
    tabId: number,
    resolved: (tab: ManagedTab) => void,
    rejected: (err: Error) => void
  ): void {
    const resList = this.readyResolvers.get(tabId);
    if (resList) {
      const idx = resList.indexOf(resolved);
      if (idx !== -1) resList.splice(idx, 1);
      if (resList.length === 0) this.readyResolvers.delete(tabId);
    }

    const rejList = this.readyRejecters.get(tabId);
    if (rejList) {
      const idx = rejList.indexOf(rejected);
      if (idx !== -1) rejList.splice(idx, 1);
      if (rejList.length === 0) this.readyRejecters.delete(tabId);
    }
  }

  public static getManagedTabs(): ManagedTab[] {
    return Array.from(this.managedTabs.values());
  }

  public static getManagedTab(tabId: number): ManagedTab | undefined {
    return this.managedTabs.get(tabId);
  }

  public static reset(): void {
    this.managedTabs.clear();
    this.readyResolvers.clear();
    this.readyRejecters.clear();
    this.isInitialized = false;
  }
}
