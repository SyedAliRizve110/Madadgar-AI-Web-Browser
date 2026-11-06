/**
 * Madadgar - Type-Safe Background Message Bus
 * Manages persistent bi-directional ports with the Side Panel,
 * routes strongly typed messages, monitors active tab transitions,
 * and extracts complete page context.
 */

import type {
  PageContext,
  PortMessage,
  GetPageContextMessage,
  PageContextResultMessage,
  TabChangedMessage,
  TabUpdatedMessage,
  ExtractReadabilityResponse,
} from '@/common/types';

export const PORT_NAME = 'madadgar-sidepanel';

export class MessageBus {
  private static connectedPorts: Set<chrome.runtime.Port> = new Set();
  private static contextCache: Map<number, PageContext> = new Map();

  /**
   * Returns list of currently connected Side Panel ports.
   */
  public static getConnectedPorts(): chrome.runtime.Port[] {
    return Array.from(this.connectedPorts);
  }

  /**
   * Registers a newly connected Side Panel port.
   */
  public static registerPort(port: chrome.runtime.Port): void {
    if (port.name !== PORT_NAME) return;

    this.connectedPorts.add(port);
    console.log(`[MessageBus] Side Panel port connected (Total: ${this.connectedPorts.size})`);

    port.onDisconnect.addListener(() => {
      this.connectedPorts.delete(port);
      console.log(`[MessageBus] Side Panel port disconnected (Remaining: ${this.connectedPorts.size})`);
    });

    port.onMessage.addListener((message: PortMessage) => {
      this.handlePortMessage(port, message).catch((err) => {
        console.error('[MessageBus] Error handling port message:', err);
      });
    });
  }

  /**
   * Broadcasts a message to all active Side Panel ports.
   */
  public static broadcast(message: PortMessage): void {
    for (const port of this.connectedPorts) {
      try {
        port.postMessage(message);
      } catch (err) {
        console.warn('[MessageBus] Failed to post message to port, deleting dead port:', err);
        this.connectedPorts.delete(port);
      }
    }
  }

  /**
   * Extracts or retrieves full page context for a given tab.
   * If tabId is omitted, queries the currently active tab in the focused window.
   */
  public static async getPageContext(
    targetTabId?: number,
    forceRefresh = false
  ): Promise<PageContext> {
    let tabId = targetTabId;
    let activeTab: chrome.tabs.Tab | null = null;

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      if (typeof tabId === 'number') {
        try {
          activeTab = await chrome.tabs.get(tabId);
        } catch {
          // Tab may have closed
        }
      }

      if (!activeTab) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTab = tabs[0] || null;
        tabId = activeTab?.id;
      }
    }

    if (!activeTab || typeof tabId !== 'number') {
      return {
        tabId: -1,
        title: 'No Active Tab',
        url: '',
        textContent: '',
        length: 0,
        timestamp: Date.now(),
      };
    }

    // Return cached context if valid and refresh not forced
    if (!forceRefresh && this.contextCache.has(tabId)) {
      return this.contextCache.get(tabId)!;
    }

    const tabUrl = activeTab.url || '';
    const tabTitle = activeTab.title || 'Untitled Page';
    const favIconUrl = activeTab.favIconUrl;

    // Handle non-scriptable internal Chrome / extension pages
    if (
      tabUrl.startsWith('chrome://') ||
      tabUrl.startsWith('chrome-extension://') ||
      tabUrl.startsWith('edge://') ||
      tabUrl.startsWith('about:')
    ) {
      const internalContext: PageContext = {
        tabId,
        title: tabTitle,
        url: tabUrl,
        favIconUrl,
        textContent: '',
        length: 0,
        timestamp: Date.now(),
      };
      this.contextCache.set(tabId, internalContext);
      return internalContext;
    }

    // Request full content and selection extraction from the content script
    let extracted: ExtractReadabilityResponse | null = null;
    try {
      extracted = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tabId!,
          { type: 'EXTRACT_READABILITY_CONTENT' },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response as ExtractReadabilityResponse);
            }
          }
        );
      });
    } catch {
      extracted = null;
    }

    const textContent = extracted?.textContent || '';
    const context: PageContext = {
      tabId,
      title: extracted?.title || tabTitle,
      url: tabUrl,
      favIconUrl,
      selection: extracted?.selection,
      textContent,
      byline: extracted?.byline || null,
      length: textContent.length,
      isYouTube: extracted?.isYouTube,
      youTubeData: extracted?.youTubeData,
      timestamp: Date.now(),
    };

    this.contextCache.set(tabId, context);
    return context;
  }

  /**
   * Handles incoming messages received through the persistent Side Panel port.
   */
  public static async handlePortMessage(
    port: chrome.runtime.Port,
    message: PortMessage
  ): Promise<void> {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'GET_PAGE_CONTEXT': {
        const getMsg = message as GetPageContextMessage;
        try {
          const context = await this.getPageContext(getMsg.tabId, getMsg.forceRefresh);
          const response: PageContextResultMessage = {
            type: 'PAGE_CONTEXT_RESULT',
            requestId: getMsg.requestId,
            context,
          };
          port.postMessage(response);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const response: PageContextResultMessage = {
            type: 'PAGE_CONTEXT_RESULT',
            requestId: getMsg.requestId,
            context: null,
            error: errorMsg,
          };
          port.postMessage(response);
        }
        break;
      }

      case 'SYNC_PAGE_CONTEXT': {
        try {
          const context = await this.getPageContext(undefined, true);
          const response: PageContextResultMessage = {
            type: 'PAGE_CONTEXT_RESULT',
            requestId: message.requestId,
            context,
          };
          port.postMessage(response);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          port.postMessage({
            type: 'PAGE_CONTEXT_RESULT',
            requestId: message.requestId,
            context: null,
            error: errorMsg,
          });
        }
        break;
      }

      case 'PING': {
        port.postMessage({
          type: 'PONG',
          requestId: message.requestId,
        });
        break;
      }

      default:
        console.warn('[MessageBus] Unhandled port message type:', message.type);
    }
  }

  /**
   * Listener for tab activation / tab switching.
   * Broadcasts TAB_CHANGED to notify Side Panel to prompt or sync context.
   */
  public static handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): void {
    console.log(`[MessageBus] Tab activated: ${activeInfo.tabId}`);
    const notification: TabChangedMessage = {
      type: 'TAB_CHANGED',
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
    };
    this.broadcast(notification);
  }

  /**
   * Listener for tab updates (URL changes, page reload completed).
   */
  public static handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): void {
    // Invalidate stale cache for updated tab
    if (changeInfo.status === 'loading' || changeInfo.url) {
      this.contextCache.delete(tabId);
    }

    if (changeInfo.status === 'complete' || changeInfo.url) {
      console.log(`[MessageBus] Tab updated: ${tabId} (${tab.url})`);
      const notification: TabUpdatedMessage = {
        type: 'TAB_UPDATED',
        tabId,
        url: tab.url,
        title: tab.title,
        status: changeInfo.status,
      };
      this.broadcast(notification);
    }
  }

  /**
   * Initializes all background port and tab listeners.
   */
  public static init(): void {
    if (typeof chrome === 'undefined') return;

    // 1. Port connection listener for Side Panel
    if (chrome.runtime?.onConnect) {
      chrome.runtime.onConnect.addListener((port) => {
        this.registerPort(port);
      });
    }

    // 2. Tab switch listener
    if (chrome.tabs?.onActivated) {
      chrome.tabs.onActivated.addListener((activeInfo) => {
        this.handleTabActivated(activeInfo);
      });
    }

    // 3. Tab update / navigation listener
    if (chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        this.handleTabUpdated(tabId, changeInfo, tab);
      });
    }

    // 4. Runtime message listener for one-off request/response
    if (chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === 'GET_PAGE_CONTEXT') {
          this.getPageContext(message.tabId, message.forceRefresh)
            .then((context) => sendResponse({ context }))
            .catch((err) => sendResponse({ error: String(err) }));
          return true; // Keep channel open
        }
        return false;
      });
    }

    console.log('[MessageBus] Initialized background port and tab listeners');
  }
}

