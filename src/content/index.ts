/**
 * Madadgar - Content Script Entry Point
 * Listens for requests from background service worker and sidepanel,
 * extracts page content (Articles and YouTube Transcripts), and seeks video playback.
 */

import {
  extractUnifiedPageContent,
  extractYouTubeTranscript,
} from './extractor';
import type { ExtractReadabilityResponse } from '@/common/types';

/**
 * Handles incoming runtime messages for the content script.
 */
export function handleContentScriptMessage(
  message: { type?: string; action?: string; seconds?: number; videoId?: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): boolean {
  const messageType = message?.type || message?.action;

  // 1. Unified Page Content / Article Extraction
  if (messageType === 'EXTRACT_READABILITY_CONTENT') {
    extractUnifiedPageContent(document)
      .then((extracted) => {
        const userSelection =
          typeof window !== 'undefined'
            ? window.getSelection()?.toString()?.trim() || undefined
            : undefined;
        sendResponse({
          ...extracted,
          selection: userSelection,
        } as ExtractReadabilityResponse);
      })
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[Madadgar Content Script] Extraction failed:', errorMsg);
        sendResponse({
          title: document?.title || 'Untitled Page',
          textContent: '',
          byline: null,
          length: 0,
          error: errorMsg,
        });
      });
    return true; // Keep message channel open for async sendResponse
  }

  // 2. Active Text Selection Extractor
  if (messageType === 'GET_PAGE_SELECTION') {
    const selection =
      typeof window !== 'undefined'
        ? window.getSelection()?.toString()?.trim() || ''
        : '';
    sendResponse({ selection });
    return true;
  }


  // 2. Explicit YouTube Transcript Extraction
  if (messageType === 'EXTRACT_YOUTUBE_TRANSCRIPT') {
    extractYouTubeTranscript(document)
      .then((ytResult) => {
        sendResponse(ytResult);
      })
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[Madadgar Content Script] YouTube transcript failed:', errorMsg);
        sendResponse({
          videoId: message.videoId || '',
          title: document?.title || 'YouTube Video',
          hasTranscript: false,
          transcriptText: '',
          segments: [],
          fallbackReason: errorMsg,
        });
      });
    return true; // Keep message channel open for async sendResponse
  }

  // 3. YouTube Video Seeking on Clickable Timestamps
  if (messageType === 'SEEK_YOUTUBE_VIDEO') {
    const targetSeconds = typeof message.seconds === 'number' ? message.seconds : 0;
    const videoEl = document.querySelector('video') as HTMLVideoElement | null;

    if (videoEl) {
      videoEl.currentTime = targetSeconds;
      if (videoEl.paused) {
        videoEl.play().catch(() => {});
      }
      sendResponse({ success: true, currentTime: videoEl.currentTime });
    } else {
      sendResponse({ success: false, error: 'No video player found on current page.' });
    }
    return true;
  }

  return false;
}

/**
 * Initialize runtime listener if chrome.runtime is available.
 */
export function initContentScript(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(handleContentScriptMessage);
    console.log('[Madadgar Content Script] Registered Madadgar content listeners');
  }
}

// Auto-initialize when content script loads in the browser page
initContentScript();


