/**
 * Madadgar - Chrome Context Menu Integrations (Task 2.3)
 * Registers right-click menu options for highlighted page text,
 * opens the Side Panel programmatically if closed, and routes
 * actions (Explain, Translate, Draft) directly to the Chat Engine.
 */

import type {
  ContextMenuActionId,
  ContextMenuActionPayload,
} from '@/common/types';
import { MessageBus } from './message_bus';

export const CONTEXT_MENU_IDS = {
  EXPLAIN: 'madadgar_explain' as ContextMenuActionId,
  TRANSLATE: 'madadgar_translate' as ContextMenuActionId,
  DRAFT: 'madadgar_draft' as ContextMenuActionId,
} as const;

export interface ContextMenuItemConfig {
  id: ContextMenuActionId;
  title: string;
  contexts: chrome.contextMenus.ContextType[];
}

export const CONTEXT_MENU_ITEMS: ContextMenuItemConfig[] = [
  {
    id: CONTEXT_MENU_IDS.EXPLAIN,
    title: 'Madadgar: Explain this',
    contexts: ['selection'],
  },
  {
    id: CONTEXT_MENU_IDS.TRANSLATE,
    title: 'Madadgar: Translate',
    contexts: ['selection'],
  },
  {
    id: CONTEXT_MENU_IDS.DRAFT,
    title: 'Madadgar: Draft a reply',
    contexts: ['selection'],
  },
];

/**
 * Generates an actionable user prompt grounded on the selected text.
 */
export function buildContextMenuPrompt(actionId: ContextMenuActionId, selectedText: string): string {
  const clean = selectedText.trim();
  switch (actionId) {
    case 'madadgar_explain':
      return `Explain the following text clearly with key insights and context:\n\n"${clean}"`;
    case 'madadgar_translate':
      return `Translate the following text to English (or Hinglish if already in English):\n\n"${clean}"`;
    case 'madadgar_draft':
      return `Draft a helpful, professional, and well-structured response to the following text:\n\n"${clean}"`;
    default:
      return clean;
  }
}

export class ContextMenuManager {
  private static clickListenerBound = false;

  /**
   * Initializes both menu creation and click event listener.
   */
  public static init(): void {
    this.createMenus();
    this.registerClickListener();
  }

  /**
   * Creates or refreshes the context menu items in Chrome.
   * Clears existing items first to avoid duplicate ID errors.
   */
  public static createMenus(): void {
    if (typeof chrome === 'undefined' || !chrome.contextMenus) {
      return;
    }

    try {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime?.lastError) {
          console.warn('[ContextMenuManager] removeAll warning:', chrome.runtime.lastError.message);
        }

        for (const item of CONTEXT_MENU_ITEMS) {
          chrome.contextMenus.create(
            {
              id: item.id,
              title: item.title,
              contexts: item.contexts,
            },
            () => {
              if (chrome.runtime?.lastError) {
                console.warn(
                  `[ContextMenuManager] Failed to create item ${item.id}:`,
                  chrome.runtime.lastError.message
                );
              }
            }
          );
        }
      });
    } catch (err) {
      console.error('[ContextMenuManager] Error during contextMenus setup:', err);
    }
  }

  /**
   * Registers the onClicked event listener.
   */
  public static registerClickListener(): void {
    if (this.clickListenerBound || typeof chrome === 'undefined' || !chrome.contextMenus?.onClicked) {
      return;
    }

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab).catch((err) => {
        console.error('[ContextMenuManager] Error handling click:', err);
      });
    });

    this.clickListenerBound = true;
  }

  /**
   * Handles user clicking a Madadgar context menu item.
   */
  public static async handleContextMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): Promise<ContextMenuActionPayload | null> {
    const actionId = info.menuItemId as ContextMenuActionId;
    const validIds = Object.values(CONTEXT_MENU_IDS);
    if (!validIds.includes(actionId)) {
      return null;
    }

    const selectedText = (info.selectionText || '').trim();
    if (!selectedText) {
      console.warn('[ContextMenuManager] Clicked context menu without selectionText');
      return null;
    }

    const prompt = buildContextMenuPrompt(actionId, selectedText);
    const payload: ContextMenuActionPayload = {
      actionId,
      selectedText,
      prompt,
      tabId: tab?.id,
      tabTitle: tab?.title,
      tabUrl: tab?.url,
      timestamp: Date.now(),
    };

    // 1. Programmatically open the Side Panel if closed
    await this.openSidePanel(tab);

    // 2. Persist the pending action so the Side Panel picks it up upon mounting/focus
    await this.savePendingAction(payload);

    // 3. Broadcast to all active Side Panel ports via MessageBus
    MessageBus.broadcast({
      type: 'CONTEXT_MENU_ACTION',
      payload,
    });

    // 4. Send runtime message for active listeners
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'CONTEXT_MENU_ACTION',
          payload,
        }).catch(() => {
          // Expected when side panel is still launching
        });
      }
    } catch {
      // Ignored
    }

    return payload;
  }

  /**
   * Opens the Chrome Side Panel for the given tab/window.
   */
  public static async openSidePanel(tab?: chrome.tabs.Tab): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.sidePanel?.open) {
      return false;
    }

    // Try opening with windowId first (standard MV3 Chrome 116+)
    if (tab?.windowId) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        return true;
      } catch (winErr) {
        console.warn('[ContextMenuManager] Could not open side panel by windowId:', winErr);
      }
    }

    // Fallback to tabId if available
    if (tab?.id) {
      try {
        await (chrome.sidePanel as any).open({ tabId: tab.id });
        return true;
      } catch (tabErr) {
        console.warn('[ContextMenuManager] Could not open side panel by tabId:', tabErr);
      }
    }

    return false;
  }

  /**
   * Persists pending context action to session storage (or local storage fallback).
   */
  public static async savePendingAction(payload: ContextMenuActionPayload): Promise<void> {
    if (typeof chrome === 'undefined') return;

    try {
      if (chrome.storage?.session) {
        await chrome.storage.session.set({ pending_context_action: payload });
      } else if (chrome.storage?.local) {
        await chrome.storage.local.set({ pending_context_action: payload });
      }
    } catch (err) {
      console.warn('[ContextMenuManager] Failed to persist pending action to storage:', err);
    }
  }

  /**
   * Retrieves and clears any pending context action from storage.
   */
  public static async consumePendingAction(): Promise<ContextMenuActionPayload | null> {
    if (typeof chrome === 'undefined') return null;

    try {
      if (chrome.storage?.session) {
        const res = await chrome.storage.session.get('pending_context_action');
        if (res?.pending_context_action) {
          await chrome.storage.session.remove('pending_context_action');
          return res.pending_context_action as ContextMenuActionPayload;
        }
      }

      if (chrome.storage?.local) {
        const res = await chrome.storage.local.get('pending_context_action');
        if (res?.pending_context_action) {
          await chrome.storage.local.remove('pending_context_action');
          return res.pending_context_action as ContextMenuActionPayload;
        }
      }
    } catch (err) {
      console.warn('[ContextMenuManager] Failed to consume pending action:', err);
    }

    return null;
  }
}

