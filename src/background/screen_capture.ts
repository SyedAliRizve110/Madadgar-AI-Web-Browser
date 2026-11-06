/**
 * Madadgar - Viewport Screen Capture (Task 2.4)
 * Invokes chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 })
 * to capture active browser viewport screenshots for visual multimodal inspection.
 */

import type { ScreenCaptureResult } from '@/common/types';

export class ScreenCaptureManager {
  /**
   * Captures the visible viewport of the active tab.
   * @param windowId Optional target window ID (defaults to current active window)
   * @param quality Compression quality (0-100, default: 80 per Task 2.4 specification)
   */
  public static async captureCurrentTab(
    windowId?: number,
    quality = 80
  ): Promise<ScreenCaptureResult> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.captureVisibleTab) {
      return {
        success: false,
        error: 'chrome.tabs.captureVisibleTab API is not available.',
        timestamp: Date.now(),
      };
    }

    try {
      let targetWindowId = windowId;

      // Determine active browser tab and window via lastFocusedWindow
      let activeTab: chrome.tabs.Tab | undefined;
      if (chrome.tabs?.query) {
        try {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          activeTab = tabs[0];
          if ((typeof targetWindowId !== 'number' || targetWindowId <= 0) && activeTab?.windowId) {
            targetWindowId = activeTab.windowId;
          }
        } catch {
          // ignore query failure and attempt fallback
        }
      }

      // If still not determined, try windows.getCurrent as secondary fallback
      if (typeof targetWindowId !== 'number' || targetWindowId <= 0) {
        if (chrome.windows?.getCurrent) {
          try {
            const currentWin = await chrome.windows.getCurrent();
            if (currentWin?.id && currentWin.id > 0) {
              targetWindowId = currentWin.id;
            }
          } catch {
            // fallback: let chrome determine window
          }
        }
      }

      // Check active tab URL to preempt internal chrome:// errors with helpful guidance
      if (activeTab?.url) {
        const url = activeTab.url.toLowerCase();
        if (
          url.startsWith('chrome://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') ||
          url.startsWith('about:')
        ) {
          return {
            success: false,
            error: 'Internal browser pages (chrome://, extension settings) cannot be screenshotted for security reasons. Please switch to a regular website or web article.',
            timestamp: Date.now(),
          };
        }
      }

      const captureOptions = {
        format: 'jpeg' as const,
        quality,
      };

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const callback = (resUrl?: string) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!resUrl) {
            reject(new Error('chrome.tabs.captureVisibleTab returned empty data URL.'));
          } else {
            resolve(resUrl);
          }
        };

        if (typeof targetWindowId === 'number' && targetWindowId > 0) {
          chrome.tabs.captureVisibleTab(targetWindowId, captureOptions, callback);
        } else {
          chrome.tabs.captureVisibleTab(captureOptions, callback);
        }
      });

      return {
        success: true,
        dataUrl,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[ScreenCaptureManager] Viewport capture failed:', message);
      return {
        success: false,
        error: message,
        timestamp: Date.now(),
      };
    }
  }
}
