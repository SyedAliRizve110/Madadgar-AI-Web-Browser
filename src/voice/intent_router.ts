/**
 * Madadgar Voice Intent & Fast-Path Grammar Router (Tasks 5.7 & 6.3)
 * Synchronous parser for spoken voice directives:
 * - Direct navigation (scroll, badge clicks, button clicks, browser back/reload)
 * - Errand Task control (approve, skip, pause, resume, cancel)
 * - Summarization & audio briefings
 * - Playback control (stop, pause, resume)
 * - General agent prompt routing (< 150ms execution latency fast-path)
 */

import type { VoiceIntent, SupportedLanguage } from '@/common/types';

export class IntentRouter {
  /**
   * Alias for parse (routes spoken transcript to structured VoiceIntent)
   */
  public static routeIntent(transcript: string, currentLanguage: SupportedLanguage = 'en'): VoiceIntent {
    return this.parse(transcript, currentLanguage);
  }

  /**
   * Parses spoken voice transcripts into structured voice intents.
   */
  public static parse(transcript: string, currentLanguage: SupportedLanguage = 'en'): VoiceIntent {
    const raw = transcript || '';
    const trimmed = raw.trim();

    // Clean transcription: remove trailing punctuation and leading Madadgar invocation keywords
    const cleaned = trimmed
      .replace(/^[,\.\?!;:]+|[,\.\?!;:]+$/g, '')
      .replace(/^(?:hey\s+|ok\s+|hello\s+)?madadgar\s*[,:\-]?\s*/i, '')
      .trim();

    const lowerCleaned = cleaned.toLowerCase();
    const lowerRaw = raw.toLowerCase();

    // -------------------------------------------------------------------------
    // 1. Task Control Directives (Task 6.3)
    // -------------------------------------------------------------------------
    if (/(?:cancel\s+(?:task|errand)|abort\s+(?:task|errand)|stop\s+(?:task|errand))/i.test(lowerCleaned)) {
      return {
        type: 'TASK_CONTROL',
        rawText: raw,
        cleanedText: cleaned,
        taskControl: 'cancel',
        confidence: 0.95,
      };
    }

    if (/^(?:pause\s+(?:task|errand|agent)|hold\s+on)$/i.test(lowerCleaned)) {
      return {
        type: 'TASK_CONTROL',
        rawText: raw,
        cleanedText: cleaned,
        taskControl: 'pause',
        confidence: 0.95,
      };
    }

    if (/^(?:resume\s+(?:task|errand|agent)|continue\s+(?:task|errand|agent))$/i.test(lowerCleaned)) {
      return {
        type: 'TASK_CONTROL',
        rawText: raw,
        cleanedText: cleaned,
        taskControl: 'resume',
        confidence: 0.95,
      };
    }

    if (/^(?:approve|confirm|yes\s+proceed|approve\s+step|yes\s+approve|proceed)$/i.test(lowerCleaned)) {
      return {
        type: 'TASK_CONTROL',
        rawText: raw,
        cleanedText: cleaned,
        taskControl: 'approve',
        confidence: 0.95,
      };
    }

    if (/^(?:skip|skip\s+step|next\s+step)$/i.test(lowerCleaned)) {
      return {
        type: 'TASK_CONTROL',
        rawText: raw,
        cleanedText: cleaned,
        taskControl: 'skip',
        confidence: 0.95,
      };
    }

    if (
      /^(?:undo|undo\s+that|revert|revert\s+that|undo\s+action|undo\s+last\s+action|wapas\s+karo|rollback)$/i.test(lowerCleaned) ||
      /(?:undo\s+that|revert\s+that|undo\s+last\s+action)/i.test(lowerCleaned)
    ) {
      return {
        type: 'TASK_CONTROL',
        rawText: raw,
        cleanedText: cleaned,
        taskControl: 'undo',
        confidence: 0.95,
      };
    }

    // -------------------------------------------------------------------------
    // 2. Continuous Voice Navigation: Scroll Directives (Task 6.3)
    // -------------------------------------------------------------------------
    if (/(?:half\s+page\s+down|scroll\s+half\s+page\s+down)/i.test(lowerCleaned)) {
      return {
        type: 'NAVIGATE_SCROLL',
        rawText: raw,
        cleanedText: cleaned,
        scrollDirection: 'half_down',
        confidence: 0.95,
      };
    }

    if (/(?:half\s+page\s+up|scroll\s+half\s+page\s+up)/i.test(lowerCleaned)) {
      return {
        type: 'NAVIGATE_SCROLL',
        rawText: raw,
        cleanedText: cleaned,
        scrollDirection: 'half_up',
        confidence: 0.95,
      };
    }

    if (/(?:scroll\s+(?:down\s+)?to\s+bottom|scroll\s+bottom|go\s+to\s+bottom)/i.test(lowerCleaned)) {
      return {
        type: 'NAVIGATE_SCROLL',
        rawText: raw,
        cleanedText: cleaned,
        scrollDirection: 'bottom',
        confidence: 0.95,
      };
    }

    if (/(?:scroll\s+(?:up\s+)?to\s+top|scroll\s+top|go\s+to\s+top)/i.test(lowerCleaned)) {
      return {
        type: 'NAVIGATE_SCROLL',
        rawText: raw,
        cleanedText: cleaned,
        scrollDirection: 'top',
        confidence: 0.95,
      };
    }

    if (/^(?:scroll\s+down|page\s+down|down|scroll\s+down\s+a\s+bit|niche\s+scroll\s+karo)$/i.test(lowerCleaned)) {
      return {
        type: 'NAVIGATE_SCROLL',
        rawText: raw,
        cleanedText: cleaned,
        scrollDirection: 'down',
        confidence: 0.95,
      };
    }

    if (/^(?:scroll\s+up|page\s+up|up|scroll\s+up\s+a\s+bit|upar\s+scroll\s+karo)$/i.test(lowerCleaned)) {
      return {
        type: 'NAVIGATE_SCROLL',
        rawText: raw,
        cleanedText: cleaned,
        scrollDirection: 'up',
        confidence: 0.95,
      };
    }

    // -------------------------------------------------------------------------
    // 3. Continuous Voice Navigation: Badge & Element Clicks (Task 6.3)
    // -------------------------------------------------------------------------
    // "Click number 4", "Click badge 7", "Click badge number 3", "Click 4", "Badge 12"
    const badgeMatch = lowerCleaned.match(
      /^(?:click\s+(?:on\s+)?(?:badge\s*(?:number\s*)?|number\s*)|badge\s+|number\s*)(\d+)$/i
    ) || lowerCleaned.match(/^click\s+(\d+)$/i);

    if (badgeMatch) {
      const badgeNumber = parseInt(badgeMatch[1], 10);
      return {
        type: 'CLICK_BADGE',
        rawText: raw,
        cleanedText: cleaned,
        badgeNumber,
        confidence: 0.95,
      };
    }

    // -------------------------------------------------------------------------
    // 4. Browser Navigation (Back, Forward, Reload) (Task 6.3)
    // -------------------------------------------------------------------------
    if (/^(?:go\s+back|back|piche\s+jao)$/i.test(lowerCleaned)) {
      return {
        type: 'BROWSER_NAVIGATION',
        rawText: raw,
        cleanedText: cleaned,
        browserNav: 'back',
        confidence: 0.95,
      };
    }

    if (/^(?:go\s+forward|forward|aage\s+jao)$/i.test(lowerCleaned)) {
      return {
        type: 'BROWSER_NAVIGATION',
        rawText: raw,
        cleanedText: cleaned,
        browserNav: 'forward',
        confidence: 0.95,
      };
    }

    if (/^(?:reload|reload\s+(?:the\s+)?page|refresh|refresh\s+(?:the\s+)?page)$/i.test(lowerCleaned)) {
      return {
        type: 'BROWSER_NAVIGATION',
        rawText: raw,
        cleanedText: cleaned,
        browserNav: 'reload',
        confidence: 0.95,
      };
    }

    // -------------------------------------------------------------------------
    // 5. Playback Control Directives (Stop, Pause, Resume)
    // -------------------------------------------------------------------------
    if (
      /^(?:stop|shut\s*up|quiet|silent|cancel|chup|chup\s*raho|ruko|ruk\s*jao|band\s*karo)(?:\s+(?:speaking|reading|audio|playback|talking))?$/i.test(lowerCleaned) ||
      /(?:stop\s+(?:speaking|reading|audio|playback|talking)|shut\s*up|chup\s*raho)/i.test(lowerCleaned)
    ) {
      return {
        type: 'STOP_SPEAKING',
        rawText: raw,
        cleanedText: cleaned,
        confidence: 0.95,
      };
    }

    if (
      /^(?:pause|pause\s+(?:speaking|reading|audio|playback)|thehro|zara\s*ruko)$/i.test(lowerCleaned) ||
      /(?:pause\s+(?:speaking|reading|audio|playback))/i.test(lowerCleaned)
    ) {
      return {
        type: 'PAUSE_SPEAKING',
        rawText: raw,
        cleanedText: cleaned,
        confidence: 0.95,
      };
    }

    if (
      /^(?:resume|continue)(?:\s+(?:reading|speaking|audio|playback))?$/i.test(lowerCleaned) ||
      /(?:resume|continue)\s+(?:reading|speaking|audio|playback)/i.test(lowerCleaned) ||
      /^(?:shuru\s*karo|aage\s*padho)$/i.test(lowerCleaned)
    ) {
      return {
        type: 'RESUME_SPEAKING',
        rawText: raw,
        cleanedText: cleaned,
        confidence: 0.95,
      };
    }

    // -------------------------------------------------------------------------
    // 6. Direct Read Aloud / Audio Briefing on existing summary
    // -------------------------------------------------------------------------
    const isDirectReadAloud =
      /^(?:audio\s*briefing|read\s*(?:aloud|out\s*loud|this\s*aloud)|speak\s*(?:the\s*)?summary|read\s*(?:the\s*)?summary|padh\s*ke\s*sunao|summary\s*sunao|bol\s*ke\s*batao)$/i.test(lowerCleaned);

    if (isDirectReadAloud) {
      return {
        type: 'READ_ALOUD_SUMMARY',
        rawText: raw,
        cleanedText: cleaned,
        audioBriefingRequested: true,
        confidence: 0.95,
      };
    }

    // -------------------------------------------------------------------------
    // 7. Summarization Intent (Task 5.7)
    // -------------------------------------------------------------------------
    const summarizeEnPatterns = [
      /(?:summarize|summary|overview|briefing)/i,
      /what(?:'s|\s+is)\s+this\s+page\s+about/i,
      /(?:read|explain)\s+this\s+(?:page|article|video|tab)/i,
    ];

    const summarizeHiPatterns = [
      /(?:is\s*page\s*(?:ko|ka)|is\s*article\s*(?:ko|ka)|page\s*ka)\s*(?:summary\s*(?:do|batao|karo)|summarize\s*karo)/i,
      /(?:summary\s*batao|isko\s*summarize\s*karo|isko\s*padh\s*ke\s*batao|page\s*khol\s*ke\s*samjhao)/i,
      /^(?:summary\s*karo|summarize\s*karo)$/i,
    ];

    const isSummarizeEn = summarizeEnPatterns.some((pattern) => pattern.test(lowerCleaned));
    const isSummarizeHi = summarizeHiPatterns.some((pattern) => pattern.test(lowerCleaned));

    if (isSummarizeEn || isSummarizeHi) {
      // Check if user explicitly asked for an audio/spoken briefing
      const audioBriefingRequested =
        /(?:audio|spoken|read\s*(?:it\s*)?aloud|speak|padh\s*ke\s*sunao|sunao|bol\s*ke|while\s*i\s*make\s*coffee|hands[\s-]free)/i.test(lowerRaw);

      const detectedLang: SupportedLanguage = isSummarizeHi
        ? 'hinglish'
        : currentLanguage;

      return {
        type: 'SUMMARIZE_PAGE',
        rawText: raw,
        cleanedText: cleaned,
        audioBriefingRequested,
        language: detectedLang,
        confidence: 0.90,
      };
    }

    // -------------------------------------------------------------------------
    // 8. Click by Target Text (e.g. "Click on Submit", "Click on Search")
    // -------------------------------------------------------------------------
    const clickTextMatch = lowerCleaned.match(
      /^(?:click(?:\s+on)?|press)\s+([a-z0-9\s\-_]{2,30})$/i
    );
    if (clickTextMatch && !/^(?:badge|number|\d+)/i.test(clickTextMatch[1])) {
      return {
        type: 'CLICK_ELEMENT_TEXT',
        rawText: raw,
        cleanedText: cleaned,
        targetText: clickTextMatch[1].trim(),
        confidence: 0.90,
      };
    }

    // -------------------------------------------------------------------------
    // 9. Fallback to General Input
    // -------------------------------------------------------------------------
    return {
      type: 'GENERAL_INPUT',
      rawText: raw,
      cleanedText: cleaned,
      confidence: 0.70,
    };
  }
}
