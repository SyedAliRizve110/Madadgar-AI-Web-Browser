/**
 * Cross-Browser & Universal Sidebar Adapter Tests (Task 5.1 & Task 5.2)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isFirefox,
  isChromium,
  hasSidePanel,
  hasSidebarAction,
  isExtensionContext,
  sendUniversalMessage,
  getBrowser,
  resetBrowserCache,
  connectUniversalPort,
} from '../common/browser_adapter';
import { UniversalSidebarAdapter, type ISidebarController } from '../common/sidebar_adapter';
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  clearAllStorage,
  getStorageUsage,
  pruneOldAuditLogsIfNeeded,
  checkAndEnforceStorageQuota,
  getAuditLogs,
  appendAuditLog,
} from '../common/storage_adapter';
import { MessageBus } from '../background/message_bus';
import { STORAGE_KEYS } from '../common/constants';

describe('Cross-Browser Abstraction Engine (CBAE - Task 5.1)', () => {
  const originalChrome = (globalThis as any).chrome;
  const originalBrowser = (globalThis as any).browser;

  afterEach(() => {
    (globalThis as any).chrome = originalChrome;
    (globalThis as any).browser = originalBrowser;
    vi.restoreAllMocks();
  });

  describe('Browser & Runtime Detection', () => {
    it('detects Chromium environment when chrome is present', () => {
      (globalThis as any).chrome = { runtime: { id: 'test-chrome-ext' } };
      (globalThis as any).browser = undefined;

      expect(isChromium()).toBe(true);
      expect(isFirefox()).toBe(false);
      expect(isExtensionContext()).toBe(true);
    });

    it('detects Firefox environment when browser.sidebarAction is present and chrome.sidePanel is absent', () => {
      (globalThis as any).chrome = { runtime: { id: 'test-ff-ext' } };
      (globalThis as any).browser = {
        runtime: { id: 'test-ff-ext' },
        sidebarAction: { open: vi.fn(), setPanel: vi.fn(), isOpen: vi.fn() },
      };

      expect(isFirefox()).toBe(true);
      expect(hasSidebarAction()).toBe(true);
      expect(hasSidePanel()).toBe(false);
    });

    it('detects sidePanel API availability on Chromium', () => {
      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        sidePanel: { open: vi.fn(), setPanelBehavior: vi.fn(), setOptions: vi.fn() },
      };
      expect(hasSidePanel()).toBe(true);
    });

    it('sendUniversalMessage routes to runtime.sendMessage with Promise resolution', async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({ status: 'OK' });
      (globalThis as any).browser = {
        runtime: { id: 'test', sendMessage: mockSendMessage },
      };

      const res = await sendUniversalMessage({ type: 'PING' });
      expect(res).toEqual({ status: 'OK' });
      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'PING' });
    });
  });

  describe('Unified Storage Adapter & Quota Bounds', () => {
    beforeEach(async () => {
      await clearAllStorage();
    });

    it('performs basic CRUD operations with universal storage wrapper', async () => {
      await setStorageItem(STORAGE_KEYS.PREFERRED_LANGUAGE, 'hinglish');
      const lang = await getStorageItem(STORAGE_KEYS.PREFERRED_LANGUAGE);
      expect(lang).toBe('hinglish');

      await removeStorageItem(STORAGE_KEYS.PREFERRED_LANGUAGE);
      const afterRemove = await getStorageItem(STORAGE_KEYS.PREFERRED_LANGUAGE);
      expect(afterRemove).toBeUndefined();
    });

    it('reports storage usage and percentage calculation', async () => {
      await setStorageItem(STORAGE_KEYS.GEMINI_API_KEY, 'test-key-1234567890');
      const report = await getStorageUsage();

      expect(report.quotaBytes).toBe(10 * 1024 * 1024);
      expect(report.bytesInUse).toBeGreaterThan(0);
      expect(report.percentageUsed).toBeGreaterThanOrEqual(0);
      expect(report.percentageUsed).toBeLessThanOrEqual(100);
    });

    it('prunes oldest audit logs if storage capacity requires cleanup', async () => {
      // Populate 10 mock audit entries
      for (let i = 1; i <= 10; i++) {
        await appendAuditLog({
          taskId: 'task-test',
          stepIndex: i,
          actionType: 'click',
          description: `Click button ${i}`,
          reasoning: 'Testing audit log pruning',
          userDecision: 'approved',
        });
      }

      const beforeLogs = await getAuditLogs();
      expect(beforeLogs.length).toBe(10);

      // Prune keeping only the top 4
      const removedCount = await pruneOldAuditLogsIfNeeded(4);
      expect(removedCount).toBe(6);

      const afterLogs = await getAuditLogs();
      expect(afterLogs.length).toBe(4);
    });

    it('proactively checks and enforces storage quota threshold', async () => {
      // 1. When below threshold (e.g. threshold 90%), no cleanup triggered
      const resultNoCleanup = await checkAndEnforceStorageQuota(90);
      expect(resultNoCleanup.cleanupTriggered).toBe(false);
      expect(resultNoCleanup.prunedAuditLogs).toBe(0);

      // 2. Populate audit logs
      for (let i = 1; i <= 35; i++) {
        await appendAuditLog({
          taskId: 'quota-test',
          stepIndex: i,
          actionType: 'type',
          description: `Input text ${i}`,
          reasoning: 'Testing quota enforcement',
          userDecision: 'approved',
        });
      }

      // 3. Force threshold to 0% to trigger cleanup
      const resultCleanup = await checkAndEnforceStorageQuota(0);
      expect(resultCleanup.cleanupTriggered).toBe(true);
      expect(resultCleanup.prunedAuditLogs).toBe(10); // 35 down to 25

      const remainingLogs = await getAuditLogs();
      expect(remainingLogs.length).toBe(25);
    });
  });
});

describe('Universal Sidebar Adapter (CBAE - Task 5.2)', () => {
  const originalChrome = (globalThis as any).chrome;
  const originalBrowser = (globalThis as any).browser;

  afterEach(() => {
    (globalThis as any).chrome = originalChrome;
    (globalThis as any).browser = originalBrowser;
    vi.restoreAllMocks();
  });

  describe('Chromium Environment (chrome.sidePanel)', () => {
    it('opens side panel using windowId when target window is specified', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        sidePanel: { open: mockOpen },
      };
      (globalThis as any).browser = undefined;

      const success = await UniversalSidebarAdapter.open({ windowId: 101 });
      expect(success).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith({ windowId: 101 });
    });

    it('opens side panel using tabId if windowId is omitted', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        sidePanel: { open: mockOpen },
      };

      const success = await UniversalSidebarAdapter.open({ tabId: 202 });
      expect(success).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith({ tabId: 202 });
    });

    it('configures openPanelOnActionClick via chrome.sidePanel.setPanelBehavior', async () => {
      const mockSetBehavior = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        sidePanel: { setPanelBehavior: mockSetBehavior },
      };

      const success = await UniversalSidebarAdapter.configureActionClick();
      expect(success).toBe(true);
      expect(mockSetBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
    });

    it('sets panel path options via chrome.sidePanel.setOptions', async () => {
      const mockSetOptions = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        sidePanel: { setOptions: mockSetOptions },
      };

      const success = await UniversalSidebarAdapter.setPanel('src/sidepanel/index.html');
      expect(success).toBe(true);
      expect(mockSetOptions).toHaveBeenCalledWith({ path: 'src/sidepanel/index.html' });
    });
  });

  describe('Mozilla Firefox Environment (browser.sidebarAction)', () => {
    it('opens sidebar using browser.sidebarAction.open()', async () => {
      const mockFfOpen = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = { runtime: { id: 'test' } };
      (globalThis as any).browser = {
        runtime: { id: 'test' },
        sidebarAction: { open: mockFfOpen },
      };

      const success = await UniversalSidebarAdapter.open({ windowId: 303 });
      expect(success).toBe(true);
      expect(mockFfOpen).toHaveBeenCalledWith({ windowId: 303 });
    });

    it('sets panel document path via browser.sidebarAction.setPanel()', async () => {
      const mockFfSetPanel = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = { runtime: { id: 'test' } };
      (globalThis as any).browser = {
        runtime: { id: 'test' },
        sidebarAction: { setPanel: mockFfSetPanel },
      };

      const success = await UniversalSidebarAdapter.setPanel('src/sidepanel/index.html');
      expect(success).toBe(true);
      expect(mockFfSetPanel).toHaveBeenCalledWith({ panel: 'src/sidepanel/index.html' });
    });

    it('queries isOpen status via browser.sidebarAction.isOpen()', async () => {
      const mockIsOpen = vi.fn().mockResolvedValue(true);
      (globalThis as any).chrome = { runtime: { id: 'test' } };
      (globalThis as any).browser = {
        runtime: { id: 'test' },
        sidebarAction: { isOpen: mockIsOpen },
      };

      const open = await UniversalSidebarAdapter.isOpen();
      expect(open).toBe(true);
      expect(mockIsOpen).toHaveBeenCalled();
    });
  });

  describe('Unsupported Environment Graceful Recovery', () => {
    it('returns false and does not throw if neither sidePanel nor sidebarAction is available', async () => {
      (globalThis as any).chrome = { runtime: { id: 'test' } };
      (globalThis as any).browser = undefined;

      const success = await UniversalSidebarAdapter.open({ windowId: 999 });
      expect(success).toBe(false);
    });
  });

  describe('ISidebarController Interface & Focus Synchronization (Task 5.2)', () => {
    it('implements ISidebarController interface with instantiated class', async () => {
      const mockOpen = vi.fn().mockResolvedValue(undefined);
      const mockSetOptions = vi.fn().mockResolvedValue(undefined);
      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        sidePanel: { open: mockOpen, setOptions: mockSetOptions },
      };

      const controller: ISidebarController = new UniversalSidebarAdapter();
      const openResult = await controller.open({ windowId: 404 });
      expect(openResult).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith({ windowId: 404 });

      const panelResult = await controller.setPanel('src/sidepanel/index.html');
      expect(panelResult).toBe(true);
      expect(mockSetOptions).toHaveBeenCalledWith({ path: 'src/sidepanel/index.html' });

      const isOpen = await controller.isOpen();
      expect(isOpen).toBe(true);
    });

    it('registers and unregisters window focus listener via initWindowFocusListener', () => {
      const mockAddListener = vi.fn();
      const mockRemoveListener = vi.fn();
      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        windows: {
          WINDOW_ID_NONE: -1,
          onFocusChanged: {
            addListener: mockAddListener,
            removeListener: mockRemoveListener,
          },
        },
      };

      const callback = vi.fn();
      const cleanup = UniversalSidebarAdapter.initWindowFocusListener(callback);

      expect(mockAddListener).toHaveBeenCalled();
      expect(typeof cleanup).toBe('function');

      // Simulate window focus change
      const registeredHandler = mockAddListener.mock.calls[0][0];
      registeredHandler(505);
      expect(callback).toHaveBeenCalledWith(505);

      // Verify ignored for WINDOW_ID_NONE (-1)
      callback.mockClear();
      registeredHandler(-1);
      expect(callback).not.toHaveBeenCalled();

      // Unregister
      cleanup?.();
      expect(mockRemoveListener).toHaveBeenCalled();
    });

    it('MessageBus handles window focus change without dropping state', async () => {
      const mockPort: any = {
        name: 'madadgar-sidepanel',
        postMessage: vi.fn(),
        onDisconnect: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
      };

      MessageBus.registerPort(mockPort);

      (globalThis as any).chrome = {
        runtime: { id: 'test' },
        windows: { WINDOW_ID_NONE: -1 },
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 777, title: 'Window Tab', url: 'https://example.com' }]),
        },
      };

      await MessageBus.handleWindowFocusChanged(888);

      // Verify port receives WINDOW_FOCUS_CHANGED and TAB_CHANGED without disconnecting or dropping
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WINDOW_FOCUS_CHANGED',
          windowId: 888,
          tabId: 777,
        })
      );
      expect(mockPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TAB_CHANGED',
          tabId: 777,
          windowId: 888,
        })
      );
    });

    it('connectUniversalPort connects port universally across browser implementations', () => {
      const mockConnect = vi.fn().mockReturnValue({ name: 'test-port' });
      (globalThis as any).chrome = {
        runtime: { id: 'test', connect: mockConnect },
      };

      const port = connectUniversalPort('madadgar-sidepanel');
      expect(port).toBeDefined();
      expect(mockConnect).toHaveBeenCalledWith({ name: 'madadgar-sidepanel' });
    });

    it('resets browser cache via resetBrowserCache', () => {
      resetBrowserCache();
      (globalThis as any).browser = { runtime: { id: 'cached-ff' } };
      const b1 = getBrowser();
      expect(b1).toBeDefined();

      resetBrowserCache();
      (globalThis as any).browser = undefined;
      (globalThis as any).chrome = { runtime: { id: 'cached-chrome' } };
      const b2 = getBrowser();
      expect(b2).toBeDefined();
    });
  });
});

