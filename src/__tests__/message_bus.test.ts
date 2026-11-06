import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageBus, PORT_NAME } from '../background/message_bus';
import type {
  PortMessage,
  GetPageContextMessage,
  PageContextResultMessage,
} from '../common/types';

describe('Active Tab Context & Bidirectional Message Bus (Task 2.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Port Registration & Lifecycle', () => {
    it('registers ports matching PORT_NAME and handles disconnects', () => {
      const disconnectListeners: Array<() => void> = [];
      const mockPort: chrome.runtime.Port = {
        name: PORT_NAME,
        onDisconnect: {
          addListener: vi.fn((fn) => disconnectListeners.push(fn)),
        } as unknown as chrome.events.Event<() => void>,
        onMessage: {
          addListener: vi.fn(),
        } as unknown as chrome.events.Event<(msg: any) => void>,
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      MessageBus.registerPort(mockPort);
      expect(MessageBus.getConnectedPorts()).toContain(mockPort);

      // Trigger disconnect
      disconnectListeners.forEach((fn) => fn());
      expect(MessageBus.getConnectedPorts()).not.toContain(mockPort);
    });

    it('ignores ports with unrecognized names', () => {
      const mockPort: chrome.runtime.Port = {
        name: 'unrelated-port',
        onDisconnect: { addListener: vi.fn() } as unknown as chrome.events.Event<() => void>,
        onMessage: { addListener: vi.fn() } as unknown as chrome.events.Event<(msg: any) => void>,
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      MessageBus.registerPort(mockPort);
      expect(MessageBus.getConnectedPorts()).not.toContain(mockPort);
    });

    it('broadcasts strongly typed messages to all connected ports', () => {
      const portA = {
        name: PORT_NAME,
        onDisconnect: { addListener: vi.fn() } as unknown as chrome.events.Event<() => void>,
        onMessage: { addListener: vi.fn() } as unknown as chrome.events.Event<(msg: any) => void>,
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };
      const portB = {
        name: PORT_NAME,
        onDisconnect: { addListener: vi.fn() } as unknown as chrome.events.Event<() => void>,
        onMessage: { addListener: vi.fn() } as unknown as chrome.events.Event<(msg: any) => void>,
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      MessageBus.registerPort(portA as unknown as chrome.runtime.Port);
      MessageBus.registerPort(portB as unknown as chrome.runtime.Port);

      const broadcastMsg: PortMessage = {
        type: 'TAB_CHANGED',
        tabId: 101,
        windowId: 1,
      };

      MessageBus.broadcast(broadcastMsg);

      expect(portA.postMessage).toHaveBeenCalledWith(broadcastMsg);
      expect(portB.postMessage).toHaveBeenCalledWith(broadcastMsg);
    });
  });

  describe('Page Context Extraction & Caching', () => {
    it('retrieves active page context and caches it', async () => {
      // Mock chrome.tabs API
      const mockTab = {
        id: 42,
        title: 'Understanding AI',
        url: 'https://example.com/ai',
        favIconUrl: 'https://example.com/favicon.ico',
      };

      global.chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([mockTab]),
          get: vi.fn().mockResolvedValue(mockTab),
          sendMessage: vi.fn((_tabId, _msg, cb) => {
            cb({
              title: 'Clean AI Title',
              textContent: 'Extracted article content about intelligent agents.',
              byline: 'Dr. Turing',
              selection: 'intelligent agents',
              length: 48,
              isYouTube: false,
            });
          }),
        },
        runtime: {
          lastError: null,
        },
      } as unknown as typeof chrome;

      const context = await MessageBus.getPageContext(42, true);

      expect(context.tabId).toBe(42);
      expect(context.title).toBe('Clean AI Title');
      expect(context.url).toBe('https://example.com/ai');
      expect(context.selection).toBe('intelligent agents');
      expect(context.textContent).toContain('Extracted article content');

      // Subsequent call without forceRefresh returns cached context without querying sendMessage again
      const cached = await MessageBus.getPageContext(42, false);
      expect(cached.title).toBe('Clean AI Title');
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('handles Chrome internal non-scriptable URLs safely', async () => {
      const mockTab = {
        id: 99,
        title: 'Extensions Settings',
        url: 'chrome://extensions',
      };

      global.chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([mockTab]),
          get: vi.fn().mockResolvedValue(mockTab),
          sendMessage: vi.fn(),
        },
      } as unknown as typeof chrome;

      const context = await MessageBus.getPageContext(99, true);

      expect(context.tabId).toBe(99);
      expect(context.url).toBe('chrome://extensions');
      expect(context.textContent).toBe('');
      // Did not attempt to send message to chrome:// page
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Port Message Dispatcher', () => {
    it('responds to GET_PAGE_CONTEXT message through port', async () => {
      const mockPort = {
        name: PORT_NAME,
        onDisconnect: { addListener: vi.fn() } as unknown as chrome.events.Event<() => void>,
        onMessage: { addListener: vi.fn() } as unknown as chrome.events.Event<(msg: any) => void>,
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      };

      const mockTab = {
        id: 77,
        title: 'Blog Post',
        url: 'https://example.com/blog',
      };

      global.chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([mockTab]),
          get: vi.fn().mockResolvedValue(mockTab),
          sendMessage: vi.fn((_tabId, _msg, cb) => {
            cb({
              title: 'Blog Post',
              textContent: 'Blog body text here.',
              length: 20,
            });
          }),
        },
        runtime: { lastError: null },
      } as unknown as typeof chrome;

      const getMsg: GetPageContextMessage = {
        type: 'GET_PAGE_CONTEXT',
        tabId: 77,
        requestId: 'req-123',
      };

      await MessageBus.handlePortMessage(mockPort as unknown as chrome.runtime.Port, getMsg);

      expect(mockPort.postMessage).toHaveBeenCalledTimes(1);
      const sent = mockPort.postMessage.mock.calls[0][0] as PageContextResultMessage;
      expect(sent.type).toBe('PAGE_CONTEXT_RESULT');
      expect(sent.requestId).toBe('req-123');
      expect(sent.context?.title).toBe('Blog Post');
    });

    it('responds to PING message with PONG', async () => {
      const mockPort = {
        postMessage: vi.fn(),
      } as unknown as chrome.runtime.Port;

      await MessageBus.handlePortMessage(mockPort, {
        type: 'PING',
        requestId: 'ping-1',
      });

      expect(mockPort.postMessage).toHaveBeenCalledWith({
        type: 'PONG',
        requestId: 'ping-1',
      });
    });
  });

  describe('Tab Activation & Updating Handlers', () => {
    it('broadcasts TAB_CHANGED event when a tab is activated', () => {
      const broadcastSpy = vi.spyOn(MessageBus, 'broadcast');

      MessageBus.handleTabActivated({ tabId: 200, windowId: 5 });

      expect(broadcastSpy).toHaveBeenCalledWith({
        type: 'TAB_CHANGED',
        tabId: 200,
        windowId: 5,
      });
    });

    it('broadcasts TAB_UPDATED event when a tab completes loading', () => {
      const broadcastSpy = vi.spyOn(MessageBus, 'broadcast');

      MessageBus.handleTabUpdated(
        200,
        { status: 'complete' },
        { id: 200, url: 'https://example.com', title: 'Example' } as chrome.tabs.Tab
      );

      expect(broadcastSpy).toHaveBeenCalledWith({
        type: 'TAB_UPDATED',
        tabId: 200,
        url: 'https://example.com',
        title: 'Example',
        status: 'complete',
      });
    });
  });
});

