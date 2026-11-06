import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  isYouTubeUrl,
  extractYouTubeVideoId,
  formatTimestamp,
  parseTimestampToSeconds,
  parseTimedTextJson,
  parseTimedTextXml,
  scrapeTranscriptFromDom,
  extractCaptionTracksFromScripts,
  extractYouTubeTranscript,
} from '../content/extractor';
import { handleContentScriptMessage } from '../content/index';
import {
  buildYouTubeSummaryPrompt,
} from '../ai/prompts/summarizer';

describe('YouTube Transcript & Caption Parser (Task 1.6)', () => {
  describe('URL Detection & Video ID Parsing', () => {
    it('correctly identifies valid YouTube video URLs including shorts and embeds', () => {
      expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(isYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
      expect(isYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
      expect(isYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);

      // Non-video URLs
      expect(isYouTubeUrl('https://example.com/article')).toBe(false);
      expect(isYouTubeUrl('https://youtube.com/feed/subscriptions')).toBe(false);
      expect(isYouTubeUrl('')).toBe(false);
    });

    it('extracts standardized 11-character video ID from watch, shorts, and youtu.be URLs', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?feature=share')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeVideoId('https://example.com/watch?v=notyoutube')).toBe(null);
    });
  });

  describe('Timestamp Formatting & Seconds Arithmetic', () => {
    it('formats seconds into [mm:ss] and [hh:mm:ss] appropriately', () => {
      expect(formatTimestamp(0)).toBe('00:00');
      expect(formatTimestamp(75)).toBe('01:15');
      expect(formatTimestamp(600)).toBe('10:00');
      expect(formatTimestamp(3675)).toBe('01:01:15');
    });

    it('parses timestamps in various notations to total seconds', () => {
      expect(parseTimestampToSeconds('01:15')).toBe(75);
      expect(parseTimestampToSeconds('[01:15]')).toBe(75);
      expect(parseTimestampToSeconds('(01:15)')).toBe(75);
      expect(parseTimestampToSeconds('01:01:15')).toBe(3675);
      expect(parseTimestampToSeconds('[02:30:10]')).toBe(9010);
      expect(parseTimestampToSeconds('invalid')).toBe(0);
    });
  });

  describe('Caption Formats Decoding (JSON3 & XML)', () => {
    it('parses YouTube timedtext JSON3 events format correctly', () => {
      const json3Data = JSON.stringify({
        events: [
          {
            tStartMs: 1200,
            dDurationMs: 2500,
            segs: [{ utf8: 'Hello and welcome ' }, { utf8: 'to this tutorial.' }],
          },
          {
            tStartMs: 4000,
            dDurationMs: 3100,
            segs: [{ utf8: 'Today we discuss artificial intelligence.' }],
          },
        ],
      });

      const segments = parseTimedTextJson(json3Data);
      expect(segments).toHaveLength(2);
      expect(segments[0].timestamp).toBe('[00:01]');
      expect(segments[0].text).toBe('Hello and welcome to this tutorial.');
      expect(segments[0].start).toBe(1);
      expect(segments[1].timestamp).toBe('[00:04]');
      expect(segments[1].text).toBe('Today we discuss artificial intelligence.');
    });

    it('parses standard XML timedtext format with HTML entity decoding', () => {
      const xmlData = `
        <transcript>
          <text start="2.4" dur="3.1">Welcome &amp; thank you for watching</text>
          <text start="6.0" dur="2.8">&quot;Machine Learning&quot; in &#39;2026&#39;</text>
        </transcript>
      `;

      const segments = parseTimedTextXml(xmlData);
      expect(segments).toHaveLength(2);
      expect(segments[0].timestamp).toBe('[00:02]');
      expect(segments[0].text).toBe('Welcome & thank you for watching');
      expect(segments[1].timestamp).toBe('[00:06]');
      expect(segments[1].text).toBe('"Machine Learning" in \'2026\'');
    });
  });

  describe('DOM Scraping & Script Parsing', () => {
    it('scrapes transcript segments directly from DOM transcript panel when rendered', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <ytd-transcript-segment-renderer>
              <div class="segment-timestamp">01:25</div>
              <div class="segment-text">Introduction to transformers architecture</div>
            </ytd-transcript-segment-renderer>
            <ytd-transcript-segment-renderer>
              <div class="segment-timestamp">03:40</div>
              <div class="segment-text">Attention mechanisms explained visually</div>
            </ytd-transcript-segment-renderer>
          </body>
        </html>
      `;

      const dom = new JSDOM(html);
      const segments = scrapeTranscriptFromDom(dom.window.document);

      expect(segments).toHaveLength(2);
      expect(segments[0].timestamp).toBe('[01:25]');
      expect(segments[0].text).toBe('Introduction to transformers architecture');
      expect(segments[0].start).toBe(85);
      expect(segments[1].timestamp).toBe('[03:40]');
      expect(segments[1].text).toBe('Attention mechanisms explained visually');
    });

    it('extracts caption tracks from embedded script tags', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script>
              var ytInitialPlayerResponse = {
                "captions": {
                  "playerCaptionsTracklistRenderer": {
                    "captionTracks": [
                      {
                        "baseUrl": "https://www.youtube.com/api/timedtext?v=test&lang=en",
                        "name": { "simpleText": "English" },
                        "languageCode": "en"
                      }
                    ]
                  }
                }
              };
            </script>
          </head>
          <body></body>
        </html>
      `;

      const dom = new JSDOM(html);
      const tracks = extractCaptionTracksFromScripts(dom.window.document);

      expect(tracks).toHaveLength(1);
      expect(tracks[0].baseUrl).toContain('https://www.youtube.com/api/timedtext');
      expect(tracks[0].languageCode).toBe('en');
    });
  });

  describe('End-to-End extractYouTubeTranscript and Edge Cases', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches and returns formatted timestamped transcript when caption tracks are present', async () => {
      const timedTextResponse = JSON.stringify({
        events: [
          {
            tStartMs: 5000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Step 1: Installing the runtime tools' }],
          },
          {
            tStartMs: 125000,
            dDurationMs: 4000,
            segs: [{ utf8: 'Step 2: Building the Chrome extension bundle' }],
          },
        ],
      });

      // Mock global fetch for timedtext endpoint
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => timedTextResponse,
      });
      global.fetch = mockFetch;

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Chrome Extension Development Tutorial - YouTube</title>
            <script>
              var ytInitialPlayerResponse = {
                "captions": {
                  "playerCaptionsTracklistRenderer": {
                    "captionTracks": [
                      {
                        "baseUrl": "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en",
                        "name": { "simpleText": "English (auto-generated)" },
                        "languageCode": "en"
                      }
                    ]
                  }
                }
              };
            </script>
          </head>
          <body>
            <h1 class="ytd-watch-metadata"><yt-formatted-string>Chrome Extension Development Tutorial</yt-formatted-string></h1>
            <div id="channel-name"><a href="#">DevGuide Studio</a></div>
            <div id="description">In this video we build an AI browser extension.</div>
          </body>
        </html>
      `;

      const dom = new JSDOM(html, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
      const result = await extractYouTubeTranscript(dom.window.document);

      expect(result.videoId).toBe('dQw4w9WgXcQ');
      expect(result.hasTranscript).toBe(true);
      expect(result.title).toBe('Chrome Extension Development Tutorial');
      expect(result.channelTitle).toBe('DevGuide Studio');
      expect(result.segments).toHaveLength(2);
      expect(result.transcriptText).toContain('[00:05] Step 1: Installing the runtime tools');
      expect(result.transcriptText).toContain('[02:05] Step 2: Building the Chrome extension bundle');
    });

    it('gracefully degrades when captions are disabled (Edge-Case 5.2)', async () => {
      // Mock fetch returning 404 or empty
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Relaxing Acoustic Guitar Instrumental - YouTube</title>
          </head>
          <body>
            <h1 class="ytd-watch-metadata"><yt-formatted-string>Relaxing Acoustic Guitar Instrumental</yt-formatted-string></h1>
            <div id="channel-name"><a href="#">Peaceful Vibes</a></div>
            <div id="description">Acoustic music for studying and relaxation without vocals.</div>
          </body>
        </html>
      `;

      const dom = new JSDOM(html, { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
      const result = await extractYouTubeTranscript(dom.window.document);

      expect(result.videoId).toBe('dQw4w9WgXcQ');
      expect(result.hasTranscript).toBe(false);
      expect(result.fallbackReason).toContain('Captions are disabled or unavailable');
      expect(result.description).toContain('Acoustic music for studying and relaxation');
      expect(result.title).toBe('Relaxing Acoustic Guitar Instrumental');
    });
  });

  describe('YouTube Summary Prompt Builder', () => {
    it('creates prompt enforcing timestamp citations [mm:ss] when captions are present', () => {
      const transcript = `[00:15] Overview of agentic design\n[01:45] Sandboxing terminal executions\n[03:20] Reviewing test coverage`;
      const { systemInstruction, userPrompt } = buildYouTubeSummaryPrompt(transcript, {
        title: 'Agentic Architectures',
        videoId: 'dQw4w9WgXcQ',
        language: 'en',
      });

      expect(systemInstruction).toContain('[mm:ss]');
      expect(systemInstruction).toContain('5 Key Takeaways');
      expect(userPrompt).toContain('Video Title: "Agentic Architectures"');
      expect(userPrompt).toContain('[00:15] Overview of agentic design');
    });

    it('supports conversational Hinglish for YouTube chapter notes', () => {
      const transcript = `[00:30] Introduction to React hooks`;
      const { systemInstruction } = buildYouTubeSummaryPrompt(transcript, {
        language: 'hinglish',
      });

      expect(systemInstruction).toContain('Hinglish');
      expect(systemInstruction).toContain('timestamp [mm:ss]');
    });

    it('instructs Gemini to summarize creator metadata when captions are disabled (Edge-Case 5.2)', () => {
      const { systemInstruction, userPrompt } = buildYouTubeSummaryPrompt('', {
        title: 'Instrumental Music',
        videoId: 'dQw4w9WgXcQ',
        hasTranscript: false,
        description: 'Original piano compositions by the artist.',
      });

      expect(systemInstruction).toContain('Captions are disabled on this video');
      expect(userPrompt).toContain('Original piano compositions by the artist.');
    });
  });

  describe('Content Script Runtime Messaging', () => {
    it('handles SEEK_YOUTUBE_VIDEO message and updates video currentTime', () => {
      const dom = new JSDOM('<!DOCTYPE html><html><body><video></video></body></html>');
      const videoEl = dom.window.document.querySelector('video') as HTMLVideoElement;
      videoEl.play = vi.fn().mockResolvedValue(undefined);

      const origDocument = global.document;
      (global as unknown as { document: Document }).document = dom.window.document as unknown as Document;

      try {
        const sendResponse = vi.fn();
        const handled = handleContentScriptMessage(
          { type: 'SEEK_YOUTUBE_VIDEO', seconds: 125 },
          {} as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(handled).toBe(true);
        expect(videoEl.currentTime).toBe(125);
        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({ success: true, currentTime: 125 })
        );
      } finally {
        global.document = origDocument;
      }
    });
  });
});

