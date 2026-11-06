import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractArticleContent,
  normalizeText,
  resolveDocumentTitle,
  resolveDocumentByline,
} from '../content/extractor';
import { handleContentScriptMessage } from '../content/index';

describe('Madadgar Content Extractor (Readability.js)', () => {
  it('extracts clean article content from a standard blog/news page', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Understanding Artificial Intelligence in 2026</title>
          <meta name="author" content="Dr. Alan Turing" />
        </head>
        <body>
          <nav>
            <ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul>
          </nav>
          <article>
            <h1>Understanding Artificial Intelligence in 2026</h1>
            <p>Artificial intelligence has revolutionized modern web computing and productivity workflows across the globe.</p>
            <p>Through agentic pairing and autonomous tools, users can conduct deep research, draft extensive analysis, and automate everyday digital errands with confidence.</p>
            <p>In this guide, we explore the core principles of Human-in-the-Loop AI and how deterministic safety layers keep systems accountable.</p>
          </article>
          <footer>
            <p>Copyright 2026 AI Insights Inc. All rights reserved.</p>
          </footer>
        </body>
      </html>
    `;

    const dom = new JSDOM(html, { url: 'https://example.com/article' });
    const result = extractArticleContent(dom.window.document);

    expect(result.title).toContain('Understanding Artificial Intelligence');
    expect(result.textContent).toContain('Artificial intelligence has revolutionized modern web computing');
    expect(result.textContent).toContain('Human-in-the-Loop AI');
    // Navigation and footer should be stripped
    expect(result.textContent).not.toContain('Home');
    expect(result.textContent).not.toContain('Copyright 2026');
    expect(result.length).toBe(result.textContent.length);
    expect(result.length).toBeGreaterThan(100);
  });

  it('strips layout chrome, ads, navbars, cookie banners, and hidden overlays', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Clean Tech News</title>
        </head>
        <body>
          <header class="site-header">
            <div class="logo">TechPulse</div>
            <nav role="navigation">
              <a href="#">Categories</a>
              <a href="#">Contact</a>
            </nav>
          </header>

          <div class="cookie-banner" id="cookie-consent">
            Please accept our cookie consent and GDPR policies to proceed.
          </div>

          <div class="ad-banner advertisement" data-ad-slot="1234">
            Special Offer: Buy cheap software now! 50% discount!
          </div>

          <div style="display: none;">
            Invisible tracking text that should never appear in summaries.
          </div>

          <div hidden>
            Another hidden DOM element.
          </div>

          <dialog role="dialog" aria-modal="true">
            Newsletter sign-up popup!
          </dialog>

          <main>
            <h1>Electric Vehicle Advancements</h1>
            <p>Solid-state battery chemistry is unlocking higher energy densities, dramatically extending the operational range of modern electric cars.</p>
            <p>Leading research institutions have reported sustained cycles exceeding one thousand charges with negligible degradation.</p>
            <p>Automakers predict widespread consumer adoption within the next three to five years as mass production lines scale up.</p>
          </main>

          <footer role="contentinfo">
            <p>Privacy Policy | Terms of Service</p>
          </footer>
        </body>
      </html>
    `;

    const dom = new JSDOM(html, { url: 'https://example.com/tech-news' });
    const result = extractArticleContent(dom.window.document);

    expect(result.textContent).toContain('Solid-state battery chemistry is unlocking higher energy densities');
    expect(result.textContent).not.toContain('Please accept our cookie consent');
    expect(result.textContent).not.toContain('Special Offer: Buy cheap software now');
    expect(result.textContent).not.toContain('Invisible tracking text');
    expect(result.textContent).not.toContain('Newsletter sign-up popup');
    expect(result.textContent).not.toContain('Privacy Policy');
    expect(result.textContent).not.toContain('TechPulse');
  });

  it('provides graceful fallback when page has no semantic article body', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Dashboard Notes</title>
          <meta property="og:title" content="Dashboard Quick Notes" />
        </head>
        <body>
          <div class="container">
            <h2>Sprint Planning Items</h2>
            <p>Refactor auth provider to use PKCE tokens.</p>
            <p>Verify that SQLite WAL mode performs well under concurrent stress tests.</p>
            <p>Update documentation for extension installation and local testing.</p>
          </div>
        </body>
      </html>
    `;

    const dom = new JSDOM(html, { url: 'https://internal.app/notes' });
    const result = extractArticleContent(dom.window.document);

    expect(result.title).toContain('Dashboard');
    expect(result.textContent).toContain('Sprint Planning Items');
    expect(result.textContent).toContain('Refactor auth provider');
    expect(result.length).toBeGreaterThan(50);
  });

  it('handles empty documents without throwing errors', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    const result = extractArticleContent(dom.window.document);

    expect(result).toBeDefined();
    expect(result.title).toBe('Untitled Page');
    expect(result.textContent).toBe('');
    expect(result.length).toBe(0);
    expect(result.byline).toBeNull();
  });

  it('correctly resolves metadata like Open Graph title and meta authors', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta property="og:title" content="OpenGraph Headline Title" />
          <meta name="author" content="Jane Doe" />
        </head>
        <body>
          <p>Some brief content describing the page.</p>
        </body>
      </html>
    `;

    const dom = new JSDOM(html);
    const title = resolveDocumentTitle(dom.window.document);
    const byline = resolveDocumentByline(dom.window.document);

    expect(title).toBe('OpenGraph Headline Title');
    expect(byline).toBe('Jane Doe');
  });

  it('normalizes irregular whitespace and linebreaks cleanly', () => {
    const input = '   Line 1 with    spaces   \r\n\r\n\r\n\r\nLine 2 after huge gaps   ';
    const cleaned = normalizeText(input);

    expect(cleaned).toBe('Line 1 with spaces\n\nLine 2 after huge gaps');
  });

  it('handles EXTRACT_READABILITY_CONTENT runtime message listener', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Listener Test Page</title></head>
        <body>
          <article>
            <h1>Test Title</h1>
            <p>This is a test paragraph to verify message passing between content script and caller.</p>
          </article>
        </body>
      </html>
    `;

    const dom = new JSDOM(html);
    // Bind global document to test DOM for the listener
    const origDocument = global.document;
    (global as unknown as { document: Document }).document = dom.window.document as unknown as Document;

    try {
      const sendResponse = vi.fn();
      const handled = handleContentScriptMessage(
        { type: 'EXTRACT_READABILITY_CONTENT' },
        {} as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(handled).toBe(true);

      // Await async handler response
      await new Promise((r) => setTimeout(r, 20));
      expect(sendResponse).toHaveBeenCalledTimes(1);

      const responseArg = sendResponse.mock.calls[0][0];
      expect(responseArg).toHaveProperty('title');
      expect(responseArg).toHaveProperty('textContent');
      expect(responseArg).toHaveProperty('length');
      expect(responseArg.textContent).toContain('test paragraph to verify message passing');
    } finally {
      global.document = origDocument;
    }
  });

  it('ignores unrelated messages and returns false', () => {
    const sendResponse = vi.fn();
    const handled = handleContentScriptMessage(
      { type: 'SOME_OTHER_EVENT' },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(handled).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
