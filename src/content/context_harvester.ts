/**
 * Madadgar - Context Harvester & Composer Injector (Task 6.5)
 * Extracts structured context from active pages (Gmail email threads, articles)
 * and dispatches generated drafts directly into active composer fields.
 */

import { UniversalContentWriter } from './universal_writer';
import type { HarvestedPageContext } from '@/common/types';

export class ContextHarvester {
  /**
   * Scrapes structured page context from the active document
   */
  public static harvestPageContext(doc: Document = document): HarvestedPageContext {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const isGmail = url.includes('mail.google.com');

    // 1. Email Context Detection (Gmail or standard webmail)
    if (isGmail || this.hasEmailStructure(doc)) {
      const emailContext = this.extractGmailContext(doc, url);
      if (emailContext) {
        return emailContext;
      }
    }

    // 2. Article / Content Context Detection
    const articleContext = this.extractArticleContext(doc, url);
    if (articleContext) {
      return articleContext;
    }

    // 3. General Fallback
    return {
      type: 'general',
      url,
      title: doc.title || 'Active Tab',
      summary: this.getMetaDescription(doc) || '',
    };
  }

  /**
   * Checks if document exhibits email thread layout
   */
  private static hasEmailStructure(doc: Document): boolean {
    return Boolean(
      doc.querySelector('.ii.gt') ||
      doc.querySelector('h2.hP') ||
      doc.querySelector('[data-thread-perm-id]') ||
      doc.querySelector('span[email]')
    );
  }

  /**
   * Extracts email sender, subject, and latest received message body from Gmail
   */
  private static extractGmailContext(doc: Document, url: string): HarvestedPageContext | null {
    // Subject
    let subject = '';
    const subjectEl = doc.querySelector('h2.hP') || doc.querySelector('[data-thread-perm-id]');
    if (subjectEl && subjectEl.textContent) {
      subject = subjectEl.textContent.trim();
    } else {
      // Fallback to title
      subject = doc.title.replace(/\s*-\s*Gmail$/i, '').trim();
    }

    // Sender
    let sender = '';
    const senderEls = doc.querySelectorAll('h3 span[email], span.gD, span[email], [data-hovercard-id]');
    if (senderEls.length > 0) {
      // Pick the last sender (most recent incoming or current view)
      const lastSenderEl = senderEls[senderEls.length - 1];
      const emailAttr = lastSenderEl.getAttribute('email') || lastSenderEl.getAttribute('data-hovercard-id');
      const textName = lastSenderEl.textContent?.trim() || '';
      sender = emailAttr ? (textName ? `${textName} <${emailAttr}>` : emailAttr) : textName;
    }

    // Body
    let fullBody = '';
    const bodyEls = doc.querySelectorAll('.ii.gt div[dir="ltr"], .a3s.aiL, div[role="listitem"] .adn .ii');
    if (bodyEls.length > 0) {
      // Take the most recent message body
      const latestBodyEl = bodyEls[bodyEls.length - 1];
      fullBody = latestBodyEl.textContent?.trim() || '';
    } else {
      // Fallback: look for general email body containers
      const genericBody = doc.querySelector('.adn, .message-body, .email-body');
      if (genericBody && genericBody.textContent) {
        fullBody = genericBody.textContent.trim();
      }
    }

    const bodySnippet = fullBody.length > 500 ? fullBody.slice(0, 500) + '...' : fullBody;

    return {
      type: 'email',
      url,
      title: subject || 'Email Message',
      subject,
      sender: sender || 'Unknown Sender',
      bodySnippet,
      fullBody,
    };
  }

  /**
   * Extracts article title, meta summary, and initial text excerpts
   */
  private static extractArticleContext(doc: Document, url: string): HarvestedPageContext | null {
    const hasArticleTag = Boolean(doc.querySelector('article, main article, [role="article"]'));
    const hasOgArticle = doc.querySelector('meta[property="og:type"]')?.getAttribute('content') === 'article';
    const paragraphs = doc.querySelectorAll('article p, main p, .post-content p, .article-body p');

    // Only identify as article if semantic article structures or multiple content paragraphs exist
    if (!hasArticleTag && !hasOgArticle && paragraphs.length < 2) {
      return null;
    }

    const title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      doc.querySelector('h1')?.textContent?.trim() ||
      doc.title;

    const summary =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      '';

    // Collect first few paragraphs from main content if available
    let bodySnippet = '';
    if (paragraphs.length > 0) {
      const texts: string[] = [];
      for (let i = 0; i < Math.min(paragraphs.length, 3); i++) {
        const text = paragraphs[i].textContent?.trim();
        if (text && text.length > 20) {
          texts.push(text);
        }
      }
      bodySnippet = texts.join('\n\n');
    }

    return {
      type: 'article',
      url,
      title: title || 'Article',
      summary: summary || bodySnippet.slice(0, 300),
      bodySnippet,
    };
  }

  /**
   * Helper to retrieve meta description
   */
  private static getMetaDescription(doc: Document): string | null {
    return (
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      null
    );
  }

  /**
   * Injects draft text into the active composer or focused input
   */
  public static injectDraft(
    text: string,
    options?: { mode?: 'replace' | 'append'; doc?: Document }
  ): { success: boolean; editorType: string; error?: string } {
    const d = options?.doc || document;
    const mode = options?.mode || 'replace';

    // 1. Locate active composer
    const composer = this.findComposerElement(d);
    if (!composer) {
      return {
        success: false,
        editorType: 'none',
        error: 'No active composer or editable text field found on page.',
      };
    }

    // 2. Dispatch injection using UniversalContentWriter
    const editorType = UniversalContentWriter.detectEditorType(composer);

    if (composer.tagName === 'INPUT' || composer.tagName === 'TEXTAREA') {
      const inputEl = composer as HTMLInputElement | HTMLTextAreaElement;
      inputEl.value = mode === 'append' ? inputEl.value + text : text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, editorType };
    }

    const success = UniversalContentWriter.write(composer, text, {
      clearFirst: mode === 'replace',
    });

    if (success && composer.isContentEditable && !composer.textContent?.includes(text)) {
      composer.textContent = text;
    }

    return {
      success,
      editorType,
    };
  }

  /**
   * Locates composer element on page (focused element, Gmail compose box, or visible editor)
   */
  public static findComposerElement(doc: Document = document): HTMLElement | null {
    // 1. Check currently active element
    const active = doc.activeElement as HTMLElement | null;
    if (
      active &&
      (active.isContentEditable ||
        active.tagName === 'TEXTAREA' ||
        (active.tagName === 'INPUT' && /^(text|search)$/i.test((active as HTMLInputElement).type)))
    ) {
      return active;
    }

    // 2. Gmail compose box
    const gmailCompose = doc.querySelector<HTMLElement>('.Am.Al.editable, div[aria-label*="Message Body"][contenteditable="true"]');
    if (gmailCompose && this.isVisible(gmailCompose)) {
      return gmailCompose;
    }

    // 3. LinkedIn post creator / Twitter compose box
    const socialCompose = doc.querySelector<HTMLElement>(
      'div[data-testid="tweetTextarea_0"], .ql-editor, [role="textbox"][contenteditable="true"], .DraftEditor-root [contenteditable="true"]'
    );
    if (socialCompose && this.isVisible(socialCompose)) {
      return socialCompose;
    }

    // 4. Any visible contenteditable
    const anyContentEditable = doc.querySelector<HTMLElement>('[contenteditable="true"]');
    if (anyContentEditable && this.isVisible(anyContentEditable)) {
      return anyContentEditable;
    }

    // 5. Any visible textarea
    const anyTextarea = doc.querySelector<HTMLElement>('textarea');
    if (anyTextarea && this.isVisible(anyTextarea)) {
      return anyTextarea;
    }

    return null;
  }

  private static isVisible(el: HTMLElement): boolean {
    if (!el || !el.isConnected) return false;
    if (el.style?.display === 'none' || el.style?.visibility === 'hidden') return false;
    if (el.offsetWidth || el.offsetHeight || el.getClientRects().length) return true;
    return el.isConnected;
  }
}
