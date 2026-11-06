/**
 * Madadgar - Content Script Entry Point
 * Listens for requests from background service worker and sidepanel,
 * extracts page content (Articles and YouTube Transcripts), and seeks video playback.
 */

import {
  extractUnifiedPageContent,
  extractYouTubeTranscript,
} from './extractor';
import { DOMScanner } from './scanner';
import { BadgeOverlay } from './overlay';
import { ActionExecutor } from './executor';
import type {
  ExtractReadabilityResponse,
  ScanDOMResponse,
  OverlayHighlightMode,
  AgentActionProposal,
} from '@/common/types';

/**
 * Handles incoming runtime messages for the content script.
 */
export function handleContentScriptMessage(
  message: {
    type?: string;
    action?: string | AgentActionProposal;
    dryRun?: boolean;
    seconds?: number;
    videoId?: string;
    renderBadges?: boolean;
    targetId?: number;
    mode?: OverlayHighlightMode;
    scrollIntoView?: boolean;
  },
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

  // 3. Interactive DOM Scanner (Task 3.1 & Task 3.2)
  if (messageType === 'SCAN_INTERACTIVE_DOM') {
    try {
      const elements = DOMScanner.scan(document);
      if (message.renderBadges !== false) {
        BadgeOverlay.renderBadges(elements);
      }
      const response: ScanDOMResponse = {
        success: true,
        count: elements.length,
        elements,
        url: typeof window !== 'undefined' ? window.location.href : '',
        title: typeof document !== 'undefined' ? document.title : '',
      };
      sendResponse(response);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Madadgar Content Script] DOM scan failed:', errorMsg);
      sendResponse({
        success: false,
        count: 0,
        elements: [],
        url: typeof window !== 'undefined' ? window.location.href : '',
        title: typeof document !== 'undefined' ? document.title : '',
        error: errorMsg,
      } as ScanDOMResponse);
    }
    return true;
  }

  // 4. Render Badges explicitly (Task 3.2)
  if (messageType === 'RENDER_BADGES') {
    const elements = DOMScanner.getLastScannedElements();
    BadgeOverlay.renderBadges(elements);
    sendResponse({ success: true, count: elements.length });
    return true;
  }

  // 5. Clear Badges & Overlay (Task 3.2)
  if (messageType === 'CLEAR_BADGES') {
    BadgeOverlay.clearBadges();
    DOMScanner.clear();
    sendResponse({ success: true });
    return true;
  }

  // 6. Highlight Target Element (Task 3.2 / 3.4)
  if (messageType === 'HIGHLIGHT_ELEMENT') {
    const targetId = message.targetId;
    if (typeof targetId === 'number') {
      const success = BadgeOverlay.highlightTarget(
        targetId,
        message.mode || 'proposed',
        message.scrollIntoView ?? true
      );
      sendResponse({ success });
    } else {
      sendResponse({ success: false, error: 'targetId must be a number' });
    }
    return true;
  }

  // 7. Locate & Pulse Element for "Find It For Me" (Task 3.4)
  if (messageType === 'LOCATE_ELEMENT') {
    const targetId = message.targetId;
    if (typeof targetId === 'number') {
      const success = BadgeOverlay.highlightTarget(targetId, 'pulse', true);
      sendResponse({ success, targetId });
    } else {
      sendResponse({ success: false, error: 'targetId must be a number' });
    }
    return true;
  }

  // 8. Clear Element Highlights (Task 3.2)
  if (messageType === 'CLEAR_HIGHLIGHTS') {
    BadgeOverlay.clearHighlights();
    sendResponse({ success: true });
    return true;
  }

  // 9. Safe Synthetic Event Action Execution (Task 3.5)
  if (messageType === 'EXECUTE_ACTION') {
    const proposal = (
      typeof message.action === 'object' ? message.action : message
    ) as unknown as AgentActionProposal;
    const dryRun = Boolean(message.dryRun);

    if (!proposal || !proposal.action) {
      sendResponse({ success: false, error: 'No valid action proposal provided.' });
      return true;
    }

    ActionExecutor.execute(proposal, dryRun)
      .then((result) => {
        sendResponse(result);
      })
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: errorMsg, action: proposal.action });
      });
    return true;
  }

  // 10. Explicit YouTube Transcript Extraction
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

  // 9. YouTube Video Seeking on Clickable Timestamps
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

export { DOMScanner, BadgeOverlay };

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


