// @vitest-environment jsdom
/**
 * Multi-Tab Errand Coordinator & State Pool Tests (Task 7.1)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TabCoordinator } from '@/background/tab_coordinator';

describe('Multi-Tab Errand Coordinator & State Pool (Task 7.1)', () => {
  beforeEach(() => {
    TabCoordinator.reset();
    vi.restoreAllMocks();

    // Mock chrome.tabs API
    (globalThis as any).chrome = {
      runtime: {
        lastError: null,
      },
      tabs: {
        create: vi.fn().mockImplementation(async ({ url, active, pinned }) => ({
          id: Math.floor(Math.random() * 1000) + 100,
          url,
          active: Boolean(active),
          pinned: Boolean(pinned),
          status: 'loading',
        })),
        sendMessage: vi.fn().mockImplementation((tabId, message, callback) => {
          callback({ success: true, tabId, received: message });
        }),
        remove: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue({}),
        onUpdated: {
          addListener: vi.fn(),
        },
        onRemoved: {
          addListener: vi.fn(),
        },
      },
    };

    TabCoordinator.init();
  });

  afterEach(() => {
    TabCoordinator.reset();
  });

  describe('Tab Spawning & Registration', () => {
    it('spawns a new tab and tracks it in the managed state pool', async () => {
      const tab = await TabCoordinator.openTab('https://example.com/productA');
      expect(tab).toBeDefined();
      expect(typeof tab.tabId).toBe('number');
      expect(tab.url).toBe('https://example.com/productA');
      expect(tab.status).toBe('loading');

      const managed = TabCoordinator.getManagedTab(tab.tabId);
      expect(managed).toBeDefined();
      expect(managed?.tabId).toBe(tab.tabId);
    });

    it('registers an existing open tab into the state pool', () => {
      const registered = TabCoordinator.registerTab(205, 'https://example.com/item', 'Item Page');
      expect(registered.tabId).toBe(205);
      expect(registered.status).toBe('ready');
      expect(TabCoordinator.getManagedTabs()).toHaveLength(1);
    });
  });

  describe('Lifecycle State Transitions & Readiness Waiting', () => {
    it('resolves waitForTabReady when tab status updates to complete', async () => {
      const tab = await TabCoordinator.openTab('https://example.com/productB');
      const waitPromise = TabCoordinator.waitForTabReady(tab.tabId, 2000);

      // Simulate chrome.tabs.onUpdated complete event
      TabCoordinator.handleTabUpdated(
        tab.tabId,
        { status: 'complete' },
        { id: tab.tabId, url: tab.url, title: 'Product B Title', status: 'complete' } as any
      );

      const readyTab = await waitPromise;
      expect(readyTab.status).toBe('ready');
      expect(readyTab.title).toBe('Product B Title');
    });

    it('rejects waitForTabReady if tab closes before completing', async () => {
      const tab = await TabCoordinator.openTab('https://example.com/productC');
      const waitPromise = TabCoordinator.waitForTabReady(tab.tabId, 2000);

      // Simulate manual user closure via onRemoved
      TabCoordinator.handleTabRemoved(tab.tabId);

      await expect(waitPromise).rejects.toThrow('closed by the user');
      const managed = TabCoordinator.getManagedTab(tab.tabId);
      expect(managed?.status).toBe('closed');
    });

    it('rejects waitForTabReady on timeout if tab never loads', async () => {
      const tab = await TabCoordinator.openTab('https://example.com/slow');
      await expect(TabCoordinator.waitForTabReady(tab.tabId, 50)).rejects.toThrow('Timeout waiting for tab');
    });
  });

  describe('Isolated Tab Messaging & Batch Cleanup', () => {
    it('sends isolated message to specified tab ID and resolves response', async () => {
      const tab = await TabCoordinator.openTab('https://example.com/msg');
      const response = await TabCoordinator.sendMessageToTab(tab.tabId, { type: 'PING' });
      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.tabId).toBe(tab.tabId);
    });

    it('fails immediately when attempting to send message to a closed tab', async () => {
      const tab = await TabCoordinator.openTab('https://example.com/closed');
      TabCoordinator.handleTabRemoved(tab.tabId);

      await expect(TabCoordinator.sendMessageToTab(tab.tabId, { type: 'PING' })).rejects.toThrow(
        'already been closed'
      );
    });

    it('closes single and all managed tabs cleanly', async () => {
      const tab1 = await TabCoordinator.openTab('https://example.com/1');
      const tab2 = await TabCoordinator.openTab('https://example.com/2');

      expect(TabCoordinator.getManagedTabs()).toHaveLength(2);

      const closeSuccess = await TabCoordinator.closeTab(tab1.tabId);
      expect(closeSuccess).toBe(true);
      expect(TabCoordinator.getManagedTab(tab1.tabId)?.status).toBe('closed');

      await TabCoordinator.closeAllManagedTabs();
      expect(TabCoordinator.getManagedTab(tab2.tabId)?.status).toBe('closed');
    });
  });
});
