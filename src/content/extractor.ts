/**
 * Madadgar Content Script Extractor
 * Uses @mozilla/readability to extract purified article content,
 * cleans layout chrome, ads, navbars, and hidden overlays,
 * and provides a graceful fallback for non-article web pages.
 */

import { Readability } from '@mozilla/readability';
import type {
  ExtractedArticle,
  YouTubeTranscriptSegment,
  YouTubeTranscriptResult,
  ExtractedContentResult,
} from '@/common/types';


/**
 * CSS selectors for elements that represent navigation chrome, ads,
 * cookie notices, paywalls, and other non-content DOM noise.
 */
const NOISE_SELECTORS = [
  // Chrome and structural noise
  'nav',
  '[role="navigation"]',
  'footer',
  '[role="contentinfo"]',
  'aside',
  '[role="complementary"]',
  'header:not(article header)',
  '[role="banner"]',

  // Media and embed noise
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',

  // Modals, dialogs, overlays, and hidden elements
  'dialog',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[aria-hidden="true"]',
  '[hidden]',
  '.modal-backdrop',
  '[class*="modal" i]',
  '[id*="modal" i]',
  '[class*="overlay" i]:not(article [class*="overlay" i])',
  '[class*="popup" i]',
  '[id*="popup" i]',

  // Cookie, consent, GDPR, and paywalls
  '[class*="cookie" i]',
  '[id*="cookie" i]',
  '[class*="consent" i]',
  '[id*="consent" i]',
  '[class*="gdpr" i]',
  '[id*="gdpr" i]',
  '[class*="paywall" i]',
  '[id*="paywall" i]',
  '[class*="newsletter" i]',
  '[id*="newsletter" i]',

  // Advertisements and sponsored blocks
  'ins.adsbygoogle',
  '[class*="advertisement" i]',
  '[id*="advertisement" i]',
  '[class*="ad-banner" i]',
  '[id*="ad-banner" i]',
  '[class*="ad-container" i]',
  '[id*="ad-container" i]',
  '[class*="sponsor" i]',
  '[id*="sponsor" i]',
  '[data-ad-slot]',
  '[data-ad-unit]',
  '[data-ad-client]',
];

/**
 * Checks whether an element is visible based on standard DOM attributes and inline styles.
 */
function isElementVisible(el: Element): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const style = el.getAttribute('style') || '';
  if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) {
    return false;
  }
  return true;
}

/**
 * Strips noise elements from a cloned DOM node.
 * This runs solely on cloned nodes to preserve the active page DOM intact.
 */
export function stripNoiseElements(root: Document | Element): void {
  // 1. Remove elements matching noise selectors
  for (const selector of NOISE_SELECTORS) {
    try {
      const elements = root.querySelectorAll(selector);
      elements.forEach((el) => {
        el.parentNode?.removeChild(el);
      });
    } catch {
      // Ignore querySelector errors for unsupported selectors in edge environments
    }
  }

  // 2. Remove elements with inline display:none or visibility:hidden styles
  try {
    const styledElements = root.querySelectorAll('[style*="display" i], [style*="visibility" i]');
    styledElements.forEach((el) => {
      const style = el.getAttribute('style') || '';
      if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) {
        el.parentNode?.removeChild(el);
      }
    });
  } catch {
    // Ignore querySelector errors
  }
}

/**
 * Cleans extracted plain text by trimming lines, normalizing spaces, and collapsing excess linebreaks.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n|\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Resolves document title from title tag, Open Graph metadata, or first H1.
 */
export function resolveDocumentTitle(doc: Document): string {
  if (doc.title && doc.title.trim().length > 0) {
    return doc.title.trim();
  }

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle && ogTitle.trim().length > 0) {
    return ogTitle.trim();
  }

  const h1 = doc.querySelector('h1')?.textContent;
  if (h1 && h1.trim().length > 0) {
    return h1.trim();
  }

  return 'Untitled Page';
}

/**
 * Resolves author/byline metadata from common meta tags.
 */
export function resolveDocumentByline(doc: Document): string | null {
  const metaAuthor =
    doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
    doc.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="twitter:creator"]')?.getAttribute('content') ||
    doc.querySelector('[rel="author"]')?.textContent;

  return metaAuthor ? metaAuthor.trim() : null;
}

/**
 * Graceful fallback extractor when Readability yields no content or too little text (< 150 chars).
 * Extracts text from <main>, <article>, or visible top-level text nodes under body.
 */
export function extractFallbackContent(doc: Document): ExtractedArticle {
  const title = resolveDocumentTitle(doc);
  const byline = resolveDocumentByline(doc);

  if (!doc.body) {
    return {
      title,
      textContent: '',
      byline,
      length: 0,
    };
  }

  // Work on a cloned body to prevent modifying page
  const bodyClone = doc.body.cloneNode(true) as HTMLElement;
  stripNoiseElements(bodyClone);

  // Check for high-relevance semantic container
  const container =
    bodyClone.querySelector('main') ||
    bodyClone.querySelector('article') ||
    bodyClone.querySelector('[role="main"]') ||
    bodyClone;

  const textBlocks: string[] = [];
  const textElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, dt, dd, pre, code');

  if (textElements.length > 0) {
    textElements.forEach((el) => {
      if (isElementVisible(el)) {
        const text = el.textContent?.trim();
        if (text && text.length > 0) {
          textBlocks.push(text);
        }
      }
    });
  }

  // If no block elements found, extract text from direct child nodes
  if (textBlocks.length === 0) {
    const rawText = container.textContent || '';
    const cleaned = normalizeText(rawText);
    if (cleaned.length > 0) {
      textBlocks.push(cleaned);
    }
  }

  const textContent = normalizeText(textBlocks.join('\n\n'));

  return {
    title,
    textContent,
    byline,
    length: textContent.length,
  };
}

/**
 * Main article extraction function.
 * Clones the input document, removes clutter/chrome/ads, runs Mozilla Readability,
 * and falls back to semantic visible node extraction if needed.
 */
export function extractArticleContent(targetDoc?: Document): ExtractedArticle {
  const doc = targetDoc || (typeof document !== 'undefined' ? document : null);

  if (!doc || !doc.body) {
    return {
      title: 'Untitled Page',
      textContent: '',
      byline: null,
      length: 0,
    };
  }

  try {
    // Clone document to safely strip noise without mutating active page
    const docClone = doc.cloneNode(true) as Document;
    stripNoiseElements(docClone);

    // Run Mozilla Readability
    let article: ReturnType<Readability['parse']> = null;
    try {
      const reader = new Readability(docClone, {
        charThreshold: 80,
      });
      article = reader.parse();
    } catch (readabilityError) {
      console.warn('[Madadgar Extractor] Readability parsing threw an error:', readabilityError);
    }

    const fallback = extractFallbackContent(doc);

    // If Readability succeeded and produced substantial text (>= 150 chars as per edge-cases.md)
    if (article && article.textContent && article.textContent.trim().length >= 150) {
      const textContent = normalizeText(article.textContent);
      const title = article.title?.trim() || fallback.title;
      const byline = article.byline?.trim() || fallback.byline;

      return {
        title,
        textContent,
        byline,
        length: textContent.length,
        excerpt: article.excerpt?.trim() || undefined,
        siteName: article.siteName?.trim() || undefined,
      };
    }

    // If Readability gave some content and fallback gave less, prefer Readability's content
    if (
      article &&
      article.textContent &&
      article.textContent.trim().length > fallback.textContent.length
    ) {
      const textContent = normalizeText(article.textContent);
      return {
        title: article.title?.trim() || fallback.title,
        textContent,
        byline: article.byline?.trim() || fallback.byline,
        length: textContent.length,
        excerpt: article.excerpt?.trim() || undefined,
        siteName: article.siteName?.trim() || undefined,
      };
    }

    // Otherwise use graceful fallback
    return fallback;
  } catch (error) {
    console.error('[Madadgar Extractor] Unexpected error during extraction:', error);
    return extractFallbackContent(doc);
  }
}

/**
 * Detects whether a URL belongs to YouTube (standard watch, shorts, embed, or youtu.be)
 */
export function isYouTubeUrl(url?: string): boolean {
  if (!url) return false;
  return /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch|shorts|embed)|youtu\.be\/)/i.test(url);
}

/**
 * Extracts the 11-character YouTube video ID from supported URL patterns.
 * Matches:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */
export function extractYouTubeVideoId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:watch\?v=|shorts\/|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

/**
 * Formats seconds into [mm:ss] or [hh:mm:ss] string.
 */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Parses timestamp string (e.g. "[01:23]", "01:23", "[1:02:45]") into total seconds.
 */
export function parseTimestampToSeconds(timestamp: string): number {
  const clean = timestamp.replace(/[\[\]\(\)]/g, '').trim();
  const parts = clean.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Parses JSON3 format YouTube timedtext (events array).
 */
export function parseTimedTextJson(jsonStr: string): YouTubeTranscriptSegment[] {
  try {
    const data = JSON.parse(jsonStr);
    const events = data.events;
    if (!Array.isArray(events)) return [];

    const segments: YouTubeTranscriptSegment[] = [];

    for (const event of events) {
      if (!event.segs || !Array.isArray(event.segs)) continue;
      const text = event.segs
        .map((s: { utf8?: string }) => s.utf8 || '')
        .join('')
        .replace(/\n+/g, ' ')
        .trim();

      if (!text) continue;

      const tStartMs = typeof event.tStartMs === 'number' ? event.tStartMs : 0;
      const dDurationMs = typeof event.dDurationMs === 'number' ? event.dDurationMs : 0;
      const startSecs = Math.floor(tStartMs / 1000);
      const durationSecs = Math.floor(dDurationMs / 1000);

      segments.push({
        text,
        start: startSecs,
        duration: durationSecs,
        timestamp: `[${formatTimestamp(startSecs)}]`,
      });
    }

    return segments;
  } catch {
    return [];
  }
}

/**
 * Parses XML format YouTube timedtext (<text start="X" dur="Y">content</text>).
 */
export function parseTimedTextXml(xmlStr: string): YouTubeTranscriptSegment[] {
  const segments: YouTubeTranscriptSegment[] = [];
  const regex = /<text\s+start="([\d\.]+)"(?:\s+dur="([\d\.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xmlStr)) !== null) {
    const startSecs = Math.floor(parseFloat(match[1]));
    const durSecs = match[2] ? Math.floor(parseFloat(match[2])) : 0;
    const rawContent = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n+/g, ' ')
      .trim();

    if (rawContent) {
      segments.push({
        text: rawContent,
        start: startSecs,
        duration: durSecs,
        timestamp: `[${formatTimestamp(startSecs)}]`,
      });
    }
  }

  return segments;
}

/**
 * Scrapes timestamped segments from YouTube DOM transcript panel if present.
 */
export function scrapeTranscriptFromDom(doc: Document): YouTubeTranscriptSegment[] {
  const segments: YouTubeTranscriptSegment[] = [];
  const renderers = doc.querySelectorAll('ytd-transcript-segment-renderer');

  renderers.forEach((el) => {
    const tsEl = el.querySelector('.segment-timestamp');
    const textEl = el.querySelector('.segment-text');
    const tsText = tsEl?.textContent?.trim() || '';
    const content = textEl?.textContent?.trim() || '';

    if (tsText && content) {
      const secs = parseTimestampToSeconds(tsText);
      segments.push({
        start: secs,
        duration: 0,
        timestamp: tsText.startsWith('[') ? tsText : `[${tsText}]`,
        text: content,
      });
    }
  });

  return segments;
}

/**
 * Extracts caption tracks list from page scripts or embedded player response.
 */
export function extractCaptionTracksFromScripts(
  doc: Document
): Array<{ baseUrl: string; languageCode?: string; name?: { simpleText?: string } }> {
  const scripts = Array.from(doc.querySelectorAll('script'));
  for (const script of scripts) {
    const text = script.textContent || '';
    if (text.includes('"captionTracks"')) {
      const match = text.match(/"captionTracks":\s*(\[[^\]]+\])/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {
          // Ignore JSON parse error in messy script tags
        }
      }
    }
  }
  return [];
}

/**
 * Extracts YouTube video metadata and public captions/transcript.
 * Gracefully degrades when captions are disabled (Edge-Case 5.2).
 */
export async function extractYouTubeTranscript(
  targetDoc?: Document,
  targetUrl?: string
): Promise<YouTubeTranscriptResult> {
  const doc = targetDoc || (typeof document !== 'undefined' ? document : null);
  const currentUrl =
    targetUrl ||
    (doc?.location?.href) ||
    (typeof window !== 'undefined' ? window.location.href : '');

  const videoId = extractYouTubeVideoId(currentUrl) || '';

  // Extract metadata from DOM
  const title =
    doc?.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
    doc?.querySelector('meta[name="title"]')?.getAttribute('content') ||
    doc?.title?.replace(/- YouTube$/i, '').trim() ||
    'YouTube Video';

  const channelTitle =
    doc?.querySelector('#channel-name a, #owner #text a')?.textContent?.trim() ||
    doc?.querySelector('link[itemprop="name"]')?.getAttribute('content') ||
    undefined;

  const description =
    doc?.querySelector('#description-inline-expander, #description')?.textContent?.trim() ||
    doc?.querySelector('meta[name="description"]')?.getAttribute('content') ||
    undefined;

  if (!videoId) {
    return {
      videoId: '',
      title,
      channelTitle,
      hasTranscript: false,
      transcriptText: '',
      segments: [],
      description,
      fallbackReason: 'No valid YouTube video ID identified.',
    };
  }

  let segments: YouTubeTranscriptSegment[] = [];

  // 1. Attempt scraping from open DOM transcript panel
  if (doc) {
    segments = scrapeTranscriptFromDom(doc);
  }

  // 2. Attempt reading captionTracks from document script tags
  if (segments.length === 0 && doc) {
    const tracks = extractCaptionTracksFromScripts(doc);
    if (tracks.length > 0) {
      const preferredTrack =
        tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0];

      if (preferredTrack?.baseUrl) {
        try {
          const fetchUrl = preferredTrack.baseUrl.includes('fmt=')
            ? preferredTrack.baseUrl
            : `${preferredTrack.baseUrl}&fmt=json3`;
          const resp = await fetch(fetchUrl);
          if (resp.ok) {
            const bodyText = await resp.text();
            segments = parseTimedTextJson(bodyText);
            if (segments.length === 0) {
              segments = parseTimedTextXml(bodyText);
            }
          }
        } catch (err) {
          console.warn('[Madadgar Extractor] Failed to fetch timedtext from baseUrl:', err);
        }
      }
    }
  }

  // 3. Fallback: Public player fetch if running outside of rendered YouTube tab
  if (segments.length === 0 && typeof fetch !== 'undefined') {
    try {
      const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
      if (pageResp.ok) {
        const pageHtml = await pageResp.text();
        const match = pageHtml.match(/"captionTracks":\s*(\[[^\]]+\])/);
        if (match) {
          const parsedTracks = JSON.parse(match[1]);
          const track =
            parsedTracks.find((t: { languageCode?: string }) => t.languageCode?.startsWith('en')) ||
            parsedTracks[0];

          if (track?.baseUrl) {
            const trackResp = await fetch(`${track.baseUrl}&fmt=json3`);
            if (trackResp.ok) {
              const bodyText = await trackResp.text();
              segments = parseTimedTextJson(bodyText);
              if (segments.length === 0) {
                segments = parseTimedTextXml(bodyText);
              }
            }
          }
        }
      }
    } catch (fetchErr) {
      console.warn('[Madadgar Extractor] Public player fallback fetch failed:', fetchErr);
    }
  }

  // If segments were found, assemble formatted timestamped transcript
  if (segments.length > 0) {
    const transcriptText = segments
      .map((seg) => `${seg.timestamp} ${seg.text}`)
      .join('\n');

    return {
      videoId,
      title,
      channelTitle,
      hasTranscript: true,
      transcriptText,
      segments,
      description,
    };
  }

  // Edge-Case 5.2 Graceful Degradation: Captions Disabled or Unavailable
  return {
    videoId,
    title,
    channelTitle,
    hasTranscript: false,
    transcriptText: '',
    segments: [],
    description,
    fallbackReason: 'Captions are disabled or unavailable for this video.',
  };
}

/**
 * Unified page content extractor.
 * Automatically branches into YouTube transcript extraction or Readability.js article parsing.
 */
export async function extractUnifiedPageContent(
  targetDoc?: Document,
  targetUrl?: string
): Promise<ExtractedContentResult> {
  const doc = targetDoc || (typeof document !== 'undefined' ? document : null);
  const currentUrl =
    targetUrl ||
    (doc?.location?.href) ||
    (typeof window !== 'undefined' ? window.location.href : '');

  if (isYouTubeUrl(currentUrl)) {
    const ytResult = await extractYouTubeTranscript(doc || undefined, currentUrl);
    return {
      title: ytResult.title,
      textContent: ytResult.hasTranscript
        ? ytResult.transcriptText
        : (ytResult.description || 'No video description available.'),
      byline: ytResult.channelTitle || null,
      length: (ytResult.hasTranscript ? ytResult.transcriptText : (ytResult.description || '')).length,
      isYouTube: true,
      youTubeData: ytResult,
    };
  }

  const article = extractArticleContent(doc || undefined);
  return {
    ...article,
    isYouTube: false,
  };
}

