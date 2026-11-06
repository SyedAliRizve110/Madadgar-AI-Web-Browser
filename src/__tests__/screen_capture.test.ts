import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenCaptureManager } from '../background/screen_capture';
import { extractCleanBase64, downscaleImage, MAX_IMAGE_DIMENSION } from '../common/image_utils';
import { AIGateway } from '../ai/ai_gateway';
import * as geminiClient from '../ai/gemini_client';
import { GEMINI_VISION_MODEL } from '../common/constants';

describe('Multimodal Visual Inspection ("Screenshot-and-Ask") (Task 2.4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ScreenCaptureManager (Background)', () => {
    it('invokes chrome.tabs.captureVisibleTab with JPEG format and quality 80', async () => {
      const mockDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
      const captureSpy = vi.fn((_winId, _opts, cb) => {
        cb(mockDataUrl);
      });

      (globalThis as any).chrome = {
        tabs: {
          captureVisibleTab: captureSpy,
          query: vi.fn().mockResolvedValue([{ url: 'https://finance.yahoo.com/chart' }]),
        },
        windows: {
          getCurrent: vi.fn().mockResolvedValue({ id: 1001 }),
        },
        runtime: {},
      };

      const result = await ScreenCaptureManager.captureCurrentTab(1001, 80);

      expect(result.success).toBe(true);
      expect(result.dataUrl).toBe(mockDataUrl);
      expect(captureSpy).toHaveBeenCalledWith(
        1001,
        { format: 'jpeg', quality: 80 },
        expect.any(Function)
      );
    });

    it('falls back to current window if windowId is omitted', async () => {
      const captureSpy = vi.fn((_winId, _opts, cb) => {
        cb('data:image/jpeg;base64,sample...');
      });

      (globalThis as any).chrome = {
        tabs: {
          captureVisibleTab: captureSpy,
          query: vi.fn().mockResolvedValue([{ url: 'https://example.com' }]),
        },
        windows: {
          getCurrent: vi.fn().mockResolvedValue({ id: 505 }),
        },
        runtime: {},
      };

      const result = await ScreenCaptureManager.captureCurrentTab(undefined, 80);

      expect(result.success).toBe(true);
      expect(captureSpy).toHaveBeenCalledWith(
        505,
        { format: 'jpeg', quality: 80 },
        expect.any(Function)
      );
    });

    it('blocks internal chrome:// and extension URLs with a friendly security message', async () => {
      const captureSpy = vi.fn();
      (globalThis as any).chrome = {
        tabs: {
          captureVisibleTab: captureSpy,
          query: vi.fn().mockResolvedValue([{ url: 'chrome://settings/passwords' }]),
        },
        windows: {
          getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
        },
      };

      const result = await ScreenCaptureManager.captureCurrentTab(1, 80);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal browser pages (chrome://, extension settings) cannot be screenshotted');
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it('gracefully handles capture runtime errors', async () => {
      (globalThis as any).chrome = {
        tabs: {
          captureVisibleTab: vi.fn((_winId, _opts, cb) => {
            (globalThis as any).chrome.runtime.lastError = { message: 'Cannot capture active tab in this state.' };
            cb(undefined);
          }),
          query: vi.fn().mockResolvedValue([{ url: 'https://restricted-origin.internal' }]),
        },
        windows: {
          getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
        },
        runtime: {
          lastError: null,
        },
      };

      const result = await ScreenCaptureManager.captureCurrentTab(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot capture active tab in this state.');
    });
  });

  describe('Image Utils & Client-side Downscaling', () => {
    it('extracts clean base64 data and mimeType from data URL', () => {
      const raw = 'data:image/jpeg;base64,QUJDREVGR0hJSktMTU5PUA==';
      const extracted = extractCleanBase64(raw);

      expect(extracted.mimeType).toBe('image/jpeg');
      expect(extracted.base64).toBe('QUJDREVGR0hJSktMTU5PUA==');
    });

    it('handles bare base64 strings without data URL header', () => {
      const bare = 'MDEyMzQ1Njc4OTA=';
      const extracted = extractCleanBase64(bare);

      expect(extracted.mimeType).toBe('image/jpeg');
      expect(extracted.base64).toBe(bare);
    });

    it('downscaleImage preserves max dimension boundary (<=1280px)', async () => {
      const sample = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = await downscaleImage(sample, 1280, 0.85);

      expect(result).toBeDefined();
      expect(result.width).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
      expect(result.height).toBeLessThanOrEqual(MAX_IMAGE_DIMENSION);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.base64).toBeDefined();
    });
  });

  describe('AIGateway Visual Inspection Routing (gemini-2.5-flash)', () => {
    it('routes visual stream requests to gemini-2.5-flash with inlineData payload', async () => {
      const streamSpy = vi.spyOn(geminiClient, 'streamGenerateContent').mockResolvedValue('Mocked visual analysis');

      const response = await AIGateway.inspectVisualStream({
        apiKey: 'AIzaSyFakeKeyForVisualTesting12345678',
        prompt: 'What does the bar chart in the top right represent?',
        imageBase64: 'U3VwZXJTZWNyZXRJbWFnZURhdGE=',
        mimeType: 'image/jpeg',
        pageContext: {
          tabId: 1,
          title: 'Quarterly Financials',
          url: 'https://company.internal/q4-report',
          textContent: '',
          length: 0,
        },
        language: 'en',
      });

      expect(response).toBe('Mocked visual analysis');
      expect(streamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: GEMINI_VISION_MODEL,
          systemInstruction: expect.stringContaining("Madadgar's Visual Intelligence Engine"),
          prompt: [
            expect.objectContaining({
              role: 'user',
              parts: [
                expect.objectContaining({
                  text: expect.stringContaining('What does the bar chart in the top right represent?'),
                }),
                expect.objectContaining({
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: 'U3VwZXJTZWNyZXRJbWFnZURhdGE=',
                  },
                }),
              ],
            }),
          ],
        })
      );
    });

    it('injects conversational Hinglish system instructions when language is hinglish', async () => {
      const generateSpy = vi.spyOn(geminiClient, 'generateContent').mockResolvedValue('Yeh chart growth dikha raha hai.');

      const response = await AIGateway.inspectVisual({
        apiKey: 'AIzaSyFakeKeyForVisualTesting12345678',
        prompt: 'Yeh graph kya bata raha hai?',
        imageBase64: 'U3VwZXJTZWNyZXRJbWFnZURhdGE=',
        language: 'hinglish',
      });

      expect(response).toBe('Yeh chart growth dikha raha hai.');
      expect(generateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash',
          systemInstruction: expect.stringContaining('Aap Madadgar ke Visual Intelligence Engine hain'),
        })
      );
    });
  });
});

