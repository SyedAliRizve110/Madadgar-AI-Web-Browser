import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContextMenuManager,
  CONTEXT_MENU_IDS,
  CONTEXT_MENU_ITEMS,
  buildContextMenuPrompt,
} from '../background/context_menus';
import { MessageBus } from '../background/message_bus';

describe('Chrome Context Menu Integrations (Task 2.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Menu Items Definition & Configuration', () => {
    it('defines exactly the 3 required context menu items with selection context', () => {
      expect(CONTEXT_MENU_ITEMS).toHaveLength(3);

      const explainItem = CONTEXT_MENU_ITEMS.find((i) => i.id === 'madadgar_explain');
      expect(explainItem).toBeDefined();
      expect(explainItem?.title).toBe('Madadgar: Explain this');
      expect(explainItem?.contexts).toContain('selection');

      const translateItem = CONTEXT_MENU_ITEMS.find((i) => i.id === 'madadgar_translate');
      expect(translateItem).toBeDefined();
      expect(translateItem?.title).toBe('Madadgar: Translate');
      expect(translateItem?.contexts).toContain('selection');

      const draftItem = CONTEXT_MENU_ITEMS.find((i) => i.id === 'madadgar_draft');
      expect(draftItem).toBeDefined();
      expect(draftItem?.title).toBe('Madadgar: Draft a reply');
      expect(draftItem?.contexts).toContain('selection');
    });

    it('builds clear, grounded prompts for each action type', () => {
      const selected = 'Quantum entanglement allows particles to share states across distances.';

      const explainPrompt = buildContextMenuPrompt(CONTEXT_MENU_IDS.EXPLAIN, selected);
      expect(explainPrompt).toContain('Explain the following text clearly');
      expect(explainPrompt).toContain(selected);

      const translatePrompt = buildContextMenuPrompt(CONTEXT_MENU_IDS.TRANSLATE, selected);
      expect(translatePrompt).toContain('Translate the following text to English');
      expect(translatePrompt).toContain(selected);

      const draftPrompt = buildContextMenuPrompt(CONTEXT_MENU_IDS.DRAFT, selected);
      expect(draftPrompt).toContain('Draft a helpful, professional, and well-structured response');
      expect(draftPrompt).toContain(selected);
    });
  });

  describe('ContextMenuManager Registration & Initialization', () => {
    it('clears previous menus and registers all items via chrome.contextMenus.create', () => {
      const createdItems: any[] = [];
      const removeAllSpy = vi.fn((cb?: () => void) => cb && cb());
      const createSpy = vi.fn((opts, cb?: () => void) => {
        createdItems.push(opts);
        if (cb) cb();
      });

      (globalThis as any).chrome = {
        contextMenus: {
          removeAll: removeAllSpy,
          create: createSpy,
          onClicked: { addListener: vi.fn() },
        },
        runtime: {},
      };

      ContextMenuManager.init();

      expect(removeAllSpy).toHaveBeenCalled();
      expect(createSpy).toHaveBeenCalledTimes(3);
      expect(createdItems.map((i) => i.id)).toEqual([
        'madadgar_explain',
        'madadgar_translate',
        'madadgar_draft',
      ]);
    });
  });

  describe('Click Handling, Programmatic Side Panel Open, and Storage Persistence', () => {
    it('opens side panel, persists pending action, and broadcasts message on valid click', async () => {
      const openSidePanelSpy = vi.fn().mockResolvedValue(undefined);
      const sessionSetSpy = vi.fn().mockResolvedValue(undefined);
      const sendMessageSpy = vi.fn().mockReturnValue(Promise.resolve());
      const broadcastSpy = vi.spyOn(MessageBus, 'broadcast').mockImplementation(() => {});

      (globalThis as any).chrome = {
        sidePanel: {
          open: openSidePanelSpy,
        },
        storage: {
          session: {
            set: sessionSetSpy,
            get: vi.fn(),
            remove: vi.fn(),
          },
        },
        runtime: {
          sendMessage: sendMessageSpy,
        },
      };

      const mockInfo = {
        menuItemId: 'madadgar_explain',
        selectionText: 'React Fiber is a complete rewrite of the React reconciliation algorithm.',
        editable: false,
        pageUrl: 'https://react.dev/blog',
      } as unknown as chrome.contextMenus.OnClickData;

      const mockTab = {
        id: 101,
        index: 0,
        pinned: false,
        highlighted: true,
        windowId: 999,
        active: true,
        incognito: false,
        selected: true,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
        title: 'React Architecture',
        url: 'https://react.dev/blog',
      } as unknown as chrome.tabs.Tab;

      const payload = await ContextMenuManager.handleContextMenuClick(mockInfo, mockTab);

      expect(payload).not.toBeNull();
      expect(payload?.actionId).toBe('madadgar_explain');
      expect(payload?.selectedText).toContain('React Fiber');
      expect(payload?.prompt).toContain('Explain the following text clearly');

      // Programmatically opened side panel with windowId
      expect(openSidePanelSpy).toHaveBeenCalledWith({ windowId: 999 });

      // Persisted to storage.session
      expect(sessionSetSpy).toHaveBeenCalledWith({
        pending_context_action: expect.objectContaining({
          actionId: 'madadgar_explain',
          tabId: 101,
        }),
      });

      // Broadcasted to active ports
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CONTEXT_MENU_ACTION',
          payload: expect.objectContaining({ actionId: 'madadgar_explain' }),
        })
      );

      // Sent runtime message
      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CONTEXT_MENU_ACTION',
        })
      );
    });

    it('falls back to tabId when sidePanel.open fails with windowId', async () => {
      const openSidePanelSpy = vi.fn()
        .mockRejectedValueOnce(new Error('windowId rejected'))
        .mockResolvedValueOnce(undefined);

      (globalThis as any).chrome = {
        sidePanel: {
          open: openSidePanelSpy,
        },
        storage: {
          session: { set: vi.fn().mockResolvedValue(undefined) },
        },
        runtime: { sendMessage: vi.fn().mockReturnValue(Promise.resolve()) },
      };
      vi.spyOn(MessageBus, 'broadcast').mockImplementation(() => {});

      const mockTab = {
        id: 202,
        index: 0,
        pinned: false,
        highlighted: true,
        windowId: 555,
        active: true,
        incognito: false,
        selected: true,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
      } as unknown as chrome.tabs.Tab;

      const opened = await ContextMenuManager.openSidePanel(mockTab);
      expect(opened).toBe(true);
      expect(openSidePanelSpy).toHaveBeenCalledTimes(2);
      expect(openSidePanelSpy).toHaveBeenNthCalledWith(1, { windowId: 555 });
      expect(openSidePanelSpy).toHaveBeenNthCalledWith(2, { tabId: 202 });
    });

    it('ignores clicks with empty selection text or unrecognized menu item ID', async () => {
      const openSpy = vi.fn();
      (globalThis as any).chrome = {
        sidePanel: { open: openSpy },
      };

      // Unrecognized ID
      const res1 = await ContextMenuManager.handleContextMenuClick({
        menuItemId: 'other_menu_item',
        selectionText: 'Some highlighted text',
        editable: false,
        pageUrl: 'https://example.com',
      } as unknown as chrome.contextMenus.OnClickData);
      expect(res1).toBeNull();
      expect(openSpy).not.toHaveBeenCalled();

      // Empty text
      const res2 = await ContextMenuManager.handleContextMenuClick({
        menuItemId: 'madadgar_translate',
        selectionText: '   ',
        editable: false,
        pageUrl: 'https://example.com',
      } as unknown as chrome.contextMenus.OnClickData);
      expect(res2).toBeNull();
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('consumes and clears pending context action from storage', async () => {
      const mockPayload = {
        actionId: 'madadgar_draft' as const,
        selectedText: 'Can you please review the attached proposal?',
        prompt: 'Draft a helpful reply',
        timestamp: 12345678,
      };

      const removeSpy = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = {
        storage: {
          session: {
            get: vi.fn().mockResolvedValue({ pending_context_action: mockPayload }),
            remove: removeSpy,
          },
        },
      };

      const consumed = await ContextMenuManager.consumePendingAction();
      expect(consumed).toEqual(mockPayload);
      expect(removeSpy).toHaveBeenCalledWith('pending_context_action');

      // Subsequent call when empty returns null
      (globalThis as any).chrome.storage.session.get = vi.fn().mockResolvedValue({});
      const empty = await ContextMenuManager.consumePendingAction();
      expect(empty).toBeNull();
    });
  });
});
