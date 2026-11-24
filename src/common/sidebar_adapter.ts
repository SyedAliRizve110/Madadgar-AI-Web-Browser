/**
 * Madadgar Universal Sidebar Adapter (CBAE - Task 5.2)
 * Bridges Google Chrome / Microsoft Edge `chrome.sidePanel` and Mozilla Firefox `browser.sidebarAction`.
 * Seamlessly manages panel mounting, programmatic opening, and action clicks.
 */

import { isFirefox, hasSidePanel, hasSidebarAction, getBrowser } from './browser_adapter';

declare const browser: { sidebarAction?: { open?: (opt?: unknown) => Promise<void>; setPanel?: (opt: { panel: string }) => Promise<void>; isOpen?: (opt: unknown) => Promise<boolean> } } | undefined;

export interface SidebarOpenOptions {
  windowId?: number;
  tabId?: number;
}

export interface ISidebarController {
  open(options?: SidebarOpenOptions): Promise<void | boolean>;
  setPanel(path: string): Promise<void | boolean>;
  isOpen(): Promise<boolean>;
}

export class UniversalSidebarAdapter implements ISidebarController {
  private static defaultPanelPath = 'src/sidepanel/index.html';

  /**
   * Instance method implementing ISidebarController
   */
  public async open(options?: SidebarOpenOptions): Promise<boolean> {
    return UniversalSidebarAdapter.open(options);
  }

  /**
   * Instance method implementing ISidebarController
   */
  public async setPanel(path: string = UniversalSidebarAdapter.defaultPanelPath): Promise<boolean> {
    return UniversalSidebarAdapter.setPanel(path);
  }

  /**
   * Instance method implementing ISidebarController
   */
  public async isOpen(): Promise<boolean> {
    return UniversalSidebarAdapter.isOpen();
  }

  /**
   * Checks if either Chromium sidePanel or Firefox sidebarAction is supported.
   */
  public static isSupported(): boolean {
    return hasSidePanel() || hasSidebarAction();
  }

  /**
   * Programmatically opens the Side Panel (Chrome) or Sidebar (Firefox).
   * Supports windowId and tabId targeting with automatic fallbacks.
   */
  public static async open(options?: SidebarOpenOptions): Promise<boolean> {
    // --- 1. Chromium sidePanel API (Chrome 116+, Edge, Brave, Opera) ---
    if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
      // Try opening targeted by windowId
      if (options?.windowId) {
        try {
          await chrome.sidePanel.open({ windowId: options.windowId });
          return true;
        } catch (winErr) {
          console.warn('[SidebarAdapter] chrome.sidePanel.open({ windowId }) failed:', winErr);
        }
      }

      // Try opening targeted by tabId
      if (options?.tabId) {
        try {
          await (chrome.sidePanel as unknown as { open: (opt: { tabId: number }) => Promise<void> }).open({
            tabId: options.tabId,
          });
          return true;
        } catch (tabErr) {
          console.warn('[SidebarAdapter] chrome.sidePanel.open({ tabId }) failed:', tabErr);
        }
      }

      // Fallback: Open in current active window
      try {
        const currentWindowId = typeof chrome.windows !== 'undefined' && chrome.windows.WINDOW_ID_CURRENT !== undefined
          ? chrome.windows.WINDOW_ID_CURRENT
          : undefined;
        if (currentWindowId !== undefined) {
          await chrome.sidePanel.open({ windowId: currentWindowId });
          return true;
        }
      } catch (currentErr) {
        console.warn('[SidebarAdapter] chrome.sidePanel.open(WINDOW_ID_CURRENT) failed:', currentErr);
      }
    }

    // --- 2. Mozilla Firefox sidebarAction API (Gecko MV3) ---
    const b = getBrowser();
    const firefoxSidebar = (b as unknown as { sidebarAction?: { open?: (opt?: unknown) => Promise<void> } })?.sidebarAction
      || (typeof browser !== 'undefined' && (browser as unknown as { sidebarAction?: { open?: (opt?: unknown) => Promise<void> } })?.sidebarAction);

    if (firefoxSidebar && typeof firefoxSidebar.open === 'function') {
      try {
        if (options?.windowId) {
          await firefoxSidebar.open({ windowId: options.windowId });
        } else {
          await firefoxSidebar.open();
        }
        return true;
      } catch (ffErr) {
        console.warn('[SidebarAdapter] browser.sidebarAction.open() failed:', ffErr);
      }
    }

    console.warn('[SidebarAdapter] Neither chrome.sidePanel nor browser.sidebarAction is operable in current environment.');
    return false;
  }

  /**
   * Sets the HTML document path for the side panel or sidebar.
   */
  public static async setPanel(path: string = this.defaultPanelPath): Promise<boolean> {
    // Chromium
    if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
      try {
        await chrome.sidePanel.setOptions({ path });
        return true;
      } catch (err) {
        console.warn('[SidebarAdapter] chrome.sidePanel.setOptions failed:', err);
      }
    }

    // Firefox
    const b = getBrowser();
    const firefoxSidebar = (b as unknown as { sidebarAction?: { setPanel?: (opt: { panel: string }) => Promise<void> } })?.sidebarAction
      || (typeof browser !== 'undefined' && (browser as unknown as { sidebarAction?: { setPanel?: (opt: { panel: string }) => Promise<void> } })?.sidebarAction);

    if (firefoxSidebar && typeof firefoxSidebar.setPanel === 'function') {
      try {
        await firefoxSidebar.setPanel({ panel: path });
        return true;
      } catch (err) {
        console.warn('[SidebarAdapter] browser.sidebarAction.setPanel failed:', err);
      }
    }

    return false;
  }

  /**
   * Configures automatic panel opening when the extension icon is clicked.
   */
  public static async configureActionClick(options?: { path?: string }): Promise<boolean> {
    const path = options?.path || this.defaultPanelPath;

    // Chromium: setPanelBehavior({ openPanelOnActionClick: true })
    if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        return true;
      } catch (err) {
        console.warn('[SidebarAdapter] chrome.sidePanel.setPanelBehavior failed:', err);
      }
    }

    // Firefox: Ensure sidebar panel path is pre-configured
    if (isFirefox()) {
      return this.setPanel(path);
    }

    return false;
  }

  /**
   * Checks whether the sidebar is currently open (supported natively in Firefox).
   */
  public static async isOpen(): Promise<boolean> {
    const b = getBrowser();
    const firefoxSidebar = (b as unknown as { sidebarAction?: { isOpen?: (opt: unknown) => Promise<boolean> } })?.sidebarAction
      || (typeof browser !== 'undefined' && (browser as unknown as { sidebarAction?: { isOpen?: (opt: unknown) => Promise<boolean> } })?.sidebarAction);

    if (firefoxSidebar && typeof firefoxSidebar.isOpen === 'function') {
      try {
        return await firefoxSidebar.isOpen({});
      } catch {
        return false;
      }
    }

    // On Chromium, sidePanel doesn't expose an isOpen() query API, default to true
    return true;
  }

  /**
   * Registers a universal window focus change listener across Chrome and Firefox.
   * Calls callback with the new windowId when a browser window gains focus.
   * Enables background & sidepanel to synchronize active window context without state dropping.
   */
  public static initWindowFocusListener(
    callback: (windowId: number) => void
  ): (() => void) | undefined {
    const b = getBrowser();
    const windowsApi = (b as unknown as { windows?: { onFocusChanged?: { addListener: (cb: (id: number) => void) => void; removeListener: (cb: (id: number) => void) => void } } })?.windows
      || (typeof chrome !== 'undefined' ? chrome.windows : undefined);

    if (windowsApi?.onFocusChanged?.addListener) {
      const listener = (windowId: number) => {
        const noneId = (typeof chrome !== 'undefined' && chrome.windows?.WINDOW_ID_NONE !== undefined)
          ? chrome.windows.WINDOW_ID_NONE
          : -1;
        if (windowId !== noneId) {
          callback(windowId);
        }
      };
      windowsApi.onFocusChanged.addListener(listener);
      return () => {
        try {
          windowsApi.onFocusChanged?.removeListener(listener);
        } catch {
          // ignore
        }
      };
    }
    return undefined;
  }
}

