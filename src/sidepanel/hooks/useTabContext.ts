import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  PageContext,
  PortMessage,
  PageContextResultMessage,
  TabChangedMessage,
  TabUpdatedMessage,
  ContextMenuActionPayload,
  ContextMenuActionMessage,
} from '@/common/types';
import { PORT_NAME } from '@/background/message_bus';

export interface UseTabContextOptions {
  autoSyncOnTabChange?: boolean;
}

export interface UseTabContextReturn {
  context: PageContext | null;
  activeTabId: number | null;
  latestTabId: number | null;
  hasTabChanged: boolean;
  isLoading: boolean;
  error: string | null;
  isPortConnected: boolean;
  pendingAction: ContextMenuActionPayload | null;
  clearPendingAction: () => void;
  syncWithActiveTab: (forceRefresh?: boolean) => Promise<PageContext | null>;
  dismissTabChangeNotification: () => void;
  sendPortMessage: (message: PortMessage) => void;
}

/**
 * Custom React hook for Side Panel to extract and synchronize
 * with the active tab context via persistent chrome.runtime.Port.
 */
export function useTabContext(options: UseTabContextOptions = {}): UseTabContextReturn {
  const { autoSyncOnTabChange = false } = options;

  const [context, setContext] = useState<PageContext | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [latestTabId, setLatestTabId] = useState<number | null>(null);
  const [hasTabChanged, setHasTabChanged] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPortConnected, setIsPortConnected] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<ContextMenuActionPayload | null>(null);

  const clearPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const activeTabIdRef = useRef<number | null>(null);
  activeTabIdRef.current = activeTabId;

  const handleMessage = useCallback((msg: PortMessage) => {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'PAGE_CONTEXT_RESULT': {
        const resultMsg = msg as PageContextResultMessage;
        if (resultMsg.error) {
          setError(resultMsg.error);
        } else if (resultMsg.context) {
          setContext(resultMsg.context);
          setActiveTabId(resultMsg.context.tabId);
          setLatestTabId(resultMsg.context.tabId);
          setHasTabChanged(false);
          setError(null);
        }
        setIsLoading(false);
        break;
      }

      case 'TAB_CHANGED': {
        const tabChangedMsg = msg as TabChangedMessage;
        const newTabId = tabChangedMsg.tabId;
        setLatestTabId(newTabId);

        if (activeTabIdRef.current !== null && newTabId !== activeTabIdRef.current) {
          setHasTabChanged(true);
          if (autoSyncOnTabChange) {
            // Auto sync context if requested
            portRef.current?.postMessage({
              type: 'GET_PAGE_CONTEXT',
              tabId: newTabId,
              forceRefresh: true,
            });
          }
        }
        break;
      }

      case 'TAB_UPDATED': {
        const tabUpdatedMsg = msg as TabUpdatedMessage;
        // If the updated tab is the one we are actively inspecting
        if (tabUpdatedMsg.tabId === activeTabIdRef.current) {
          if (tabUpdatedMsg.status === 'complete') {
            portRef.current?.postMessage({
              type: 'GET_PAGE_CONTEXT',
              tabId: tabUpdatedMsg.tabId,
              forceRefresh: true,
            });
          }
        }
        break;
      }

      case 'CONTEXT_MENU_ACTION': {
        const contextMenuMsg = msg as ContextMenuActionMessage;
        if (contextMenuMsg.payload) {
          setPendingAction(contextMenuMsg.payload);
        }
        break;
      }

      default:
        break;
    }
  }, [autoSyncOnTabChange]);

  const connectPort = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.connect) {
      setIsLoading(false);
      return null;
    }

    try {
      const port = chrome.runtime.connect({ name: PORT_NAME });
      portRef.current = port;
      setIsPortConnected(true);

      port.onMessage.addListener(handleMessage);

      port.onDisconnect.addListener(() => {
        portRef.current = null;
        setIsPortConnected(false);
        // If extension worker restarted, attempt reconnect after slight backoff
        setTimeout(() => {
          if (!portRef.current) {
            connectPort();
          }
        }, 1000);
      });

      // Request initial active page context
      port.postMessage({
        type: 'GET_PAGE_CONTEXT',
        forceRefresh: false,
      });

      return port;
    } catch (err: unknown) {
      console.warn('[useTabContext] Failed to connect port:', err);
      setIsPortConnected(false);
      setIsLoading(false);
      return null;
    }
  }, [handleMessage]);

  useEffect(() => {
    const port = connectPort();

    // Check for any pending context menu action queued before mount
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: 'GET_PENDING_CONTEXT_ACTION' }, (response) => {
          if (!chrome.runtime.lastError && response?.action) {
            setPendingAction(response.action);
          }
        });
      } catch {
        // ignore
      }
    }

    // Direct runtime message listener for context menu action
    const runtimeListener = (message: any) => {
      if (message?.type === 'CONTEXT_MENU_ACTION' && message.payload) {
        setPendingAction(message.payload);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(runtimeListener);
    }

    return () => {
      if (port) {
        try {
          port.disconnect();
        } catch {
          // ignore already disconnected
        }
      }
      portRef.current = null;
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(runtimeListener);
      }
    };
  }, [connectPort]);

  const syncWithActiveTab = useCallback(async (forceRefresh = true): Promise<PageContext | null> => {
    setIsLoading(true);
    setError(null);

    // 1. If port is connected, send request via port
    if (portRef.current) {
      portRef.current.postMessage({
        type: 'GET_PAGE_CONTEXT',
        forceRefresh,
      });
    }

    // 2. Also execute runtime message as a resilient fallback
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        const response: { context?: PageContext; error?: string } = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'GET_PAGE_CONTEXT', forceRefresh },
            (resp) => {
              if (chrome.runtime?.lastError) {
                resolve({ error: chrome.runtime.lastError.message });
              } else {
                resolve(resp || {});
              }
            }
          );
        });

        if (response?.context) {
          setContext(response.context);
          setActiveTabId(response.context.tabId);
          setLatestTabId(response.context.tabId);
          setHasTabChanged(false);
          setIsLoading(false);
          return response.context;
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        setIsLoading(false);
      }
    }

    return null;
  }, []);

  const dismissTabChangeNotification = useCallback(() => {
    setHasTabChanged(false);
  }, []);

  const sendPortMessage = useCallback((message: PortMessage) => {
    if (portRef.current) {
      portRef.current.postMessage(message);
    } else {
      console.warn('[useTabContext] Cannot send message: Port not connected');
    }
  }, []);

  return {
    context,
    activeTabId,
    latestTabId,
    hasTabChanged,
    isLoading,
    error,
    isPortConnected,
    pendingAction,
    clearPendingAction,
    syncWithActiveTab,
    dismissTabChangeNotification,
    sendPortMessage,
  };
}

