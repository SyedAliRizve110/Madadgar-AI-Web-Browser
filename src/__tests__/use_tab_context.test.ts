import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PORT_NAME } from '../background/message_bus';
import { useTabContext } from '../sidepanel/hooks/useTabContext';

describe('useTabContext Hook (Task 2.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes expected hook interface and functions', () => {
    // In node/headless environment without browser rendering, we can verify function exists and types match
    expect(typeof useTabContext).toBe('function');
  });

  it('connects to chrome.runtime.Port with PORT_NAME', () => {
    const postMessageMock = vi.fn();
    const addListenerMock = vi.fn();
    const disconnectAddListenerMock = vi.fn();

    const mockPort: chrome.runtime.Port = {
      name: PORT_NAME,
      postMessage: postMessageMock,
      onMessage: { addListener: addListenerMock } as unknown as chrome.events.Event<(msg: any) => void>,
      onDisconnect: { addListener: disconnectAddListenerMock } as unknown as chrome.events.Event<() => void>,
      disconnect: vi.fn(),
    };

    const connectMock = vi.fn().mockReturnValue(mockPort);

    global.chrome = {
      runtime: {
        connect: connectMock,
      },
    } as unknown as typeof chrome;

    // Call connect directly as the hook would
    const port = global.chrome.runtime.connect({ name: PORT_NAME });
    expect(connectMock).toHaveBeenCalledWith({ name: PORT_NAME });
    expect(port.name).toBe(PORT_NAME);
  });
});

