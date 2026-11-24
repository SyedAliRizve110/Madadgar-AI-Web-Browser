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
import { ContentGuardrails } from './guardrails';
import { ContextHarvester } from './context_harvester';
import { GhostwriterOverlay } from './ghostwriter_overlay';
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
    const pageSafety = ContentGuardrails.checkActivePageSafety();
    if (!pageSafety.safe) {
      sendResponse({
        title: typeof document !== 'undefined' ? document.title : 'Restricted Page',
        textContent: '',
        byline: null,
        length: 0,
        error: pageSafety.reason,
        isBlacklisted: true,
      } as ExtractReadabilityResponse);
      return true;
    }

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

  // 3. Interactive DOM Scanner (Task 3.1, Task 3.2, Task 4.4.1)
  if (messageType === 'SCAN_INTERACTIVE_DOM') {
    const pageSafety = ContentGuardrails.checkActivePageSafety();
    if (!pageSafety.safe) {
      sendResponse({
        success: false,
        count: 0,
        elements: [],
        url: typeof window !== 'undefined' ? window.location.href : '',
        title: typeof document !== 'undefined' ? document.title : '',
        error: pageSafety.reason,
        isBlacklisted: true,
      } as ScanDOMResponse);
      return true;
    }

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

  // 5. Clear Badges & Overlay (Task 3.2 / Task 4.4.4)
  if (messageType === 'CLEAR_BADGES' || messageType === 'EMERGENCY_KILL_SWITCH') {
    ContentGuardrails.emergencyTeardown();
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

  // 9b. Fast-Path Direct Voice Navigation Handlers (Task 6.3)
  if (messageType === 'EXECUTE_SCROLL') {
    const direction = (message as any).direction || 'down';
    const success = ActionExecutor.executeScroll(null, direction);
    sendResponse({ success, direction });
    return true;
  }

  if (messageType === 'CLICK_BADGE') {
    const badgeId = (message as any).badgeNumber ?? (message as any).targetId;
    if (typeof badgeId === 'number') {
      try {
        const success = ActionExecutor.executeBadgeClick(badgeId);
        sendResponse({ success, badgeNumber: badgeId });
      } catch (err: any) {
        sendResponse({ success: false, error: err.message });
      }
    } else {
      sendResponse({ success: false, error: 'badgeNumber must be a number.' });
    }
    return true;
  }

  if (messageType === 'CLICK_ELEMENT_TEXT') {
    const targetText = (message as any).targetText;
    if (typeof targetText === 'string') {
      try {
        const success = ActionExecutor.executeClickByText(targetText);
        sendResponse({ success, targetText });
      } catch (err: any) {
        sendResponse({ success: false, error: err.message });
      }
    } else {
      sendResponse({ success: false, error: 'targetText must be a string.' });
    }
    return true;
  }

  // 9b-2. Action Undo & Rollback Dispatcher (Task 6.7)
  if (messageType === 'EXECUTE_UNDO') {
    try {
      const result = ActionExecutor.executeUndo((message as any).snapshot);
      sendResponse(result);
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  // 9c. Context Harvester & Composer Injector (Task 6.5)
  if (messageType === 'HARVEST_PAGE_CONTEXT') {
    try {
      const context = ContextHarvester.harvestPageContext(document);
      sendResponse({ success: true, context });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (messageType === 'INJECT_DRAFT') {
    const textToInject = (message as any).text || '';
    const mode = (message as any).mode || 'replace';
    try {
      const result = ContextHarvester.injectDraft(textToInject, { mode, doc: document });
      sendResponse(result);
    } catch (err: any) {
      sendResponse({ success: false, error: err.message, editorType: 'none' });
    }
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

let selectionDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
export function handleSelectionChange(): void {
  if (typeof window === 'undefined' || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return;
  }
  if (selectionDebounceTimeout) {
    clearTimeout(selectionDebounceTimeout);
  }
  selectionDebounceTimeout = setTimeout(() => {
    try {
      const sel = window.getSelection()?.toString()?.trim() || '';
      chrome.runtime
        .sendMessage({
          type: 'PAGE_SELECTION_CHANGED',
          selection: sel,
        })
        .catch(() => {
          // Expected when side panel is not listening
        });
    } catch {
      // Ignored
    }
  }, 250);
}

/**
 * Initialize runtime listener if chrome.runtime is available.
 */
export function initContentScript(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(handleContentScriptMessage);
    console.log('[Madadgar Content Script] Registered Madadgar content listeners');
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    GhostwriterOverlay.init();

    // Task 5.4: Content-script level hotkey listener for Alt+V
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
        chrome.runtime.sendMessage({ type: 'TOGGLE_VOICE_FROM_CONTENT' }).catch(() => {
          // Extension might be reloading
        });
      }
    });
  }
}

// Auto-initialize when content script loads in the browser page
initContentScript();


