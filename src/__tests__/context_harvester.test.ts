// @vitest-environment jsdom
/**
 * Context-Aware Email Replier & Social Post Drafter Tests (Task 6.5)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextHarvester } from '@/content/context_harvester';

describe('Context-Aware Harvester & Composer Injector (Task 6.5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('Page Context Harvesting', () => {
    it('correctly extracts Gmail email thread context (sender, subject, body)', () => {
      document.body.innerHTML = `
        <h2 class="hP">Meeting Reschedule & Next Steps</h2>
        <div class="email-thread">
          <div role="listitem">
            <h3><span email="sarah.connor@cyberdyne.io">Sarah Connor</span></h3>
            <div class="ii gt">
              <div dir="ltr">Hi team, can we move our sprint sync to Friday at 3 PM? Let me know if that works.</div>
            </div>
          </div>
        </div>
      `;

      const context = ContextHarvester.harvestPageContext(document);
      expect(context.type).toBe('email');
      expect(context.subject).toBe('Meeting Reschedule & Next Steps');
      expect(context.sender).toContain('sarah.connor@cyberdyne.io');
      expect(context.fullBody).toContain('move our sprint sync to Friday at 3 PM');
    });

    it('extracts article title, meta description, and paragraph excerpts', () => {
      document.head.innerHTML = `
        <meta property="og:title" content="The Future of Autonomous Web Assistants" />
        <meta name="description" content="An in-depth analysis of browser extensions acting as autonomous co-pilots." />
      `;
      document.body.innerHTML = `
        <article>
          <h1>The Future of Autonomous Web Assistants</h1>
          <p>Autonomous AI agents are transitioning from simple chatbots to active browser assistants capable of multi-step task execution.</p>
          <p>Through robust synthetic event simulation and human-in-the-loop safeguards, users retain total control over consequential operations.</p>
        </article>
      `;

      const context = ContextHarvester.harvestPageContext(document);
      expect(context.type).toBe('article');
      expect(context.title).toBe('The Future of Autonomous Web Assistants');
      expect(context.summary).toContain('An in-depth analysis of browser extensions');
      expect(context.bodySnippet).toContain('Autonomous AI agents are transitioning');
    });

    it('falls back to general context for standard pages', () => {
      document.head.innerHTML = `<title>My Dashboard - Portal</title>`;
      document.body.innerHTML = `<div>Welcome back user.</div>`;

      const context = ContextHarvester.harvestPageContext(document);
      expect(context.type).toBe('general');
      expect(context.title).toBe('My Dashboard - Portal');
    });
  });

  describe('Draft Injection into Composers', () => {
    it('injects draft into an active textarea composer', () => {
      const textarea = document.createElement('textarea');
      textarea.id = 'comment-box';
      document.body.appendChild(textarea);
      textarea.focus();

      const result = ContextHarvester.injectDraft('Sounds great, Friday at 3 PM works for me.', {
        mode: 'replace',
        doc: document,
      });

      expect(result.success).toBe(true);
      expect(textarea.value).toBe('Sounds great, Friday at 3 PM works for me.');
    });

    it('injects draft into a Gmail-style contenteditable message body', () => {
      const gmailEditor = document.createElement('div');
      gmailEditor.setAttribute('contenteditable', 'true');
      gmailEditor.className = 'Am Al editable';
      gmailEditor.setAttribute('aria-label', 'Message Body');
      document.body.appendChild(gmailEditor);

      const result = ContextHarvester.injectDraft('Hi Sarah,\n\nFriday at 3 PM is confirmed.\n\nBest,\nAlex', {
        mode: 'replace',
        doc: document,
      });

      expect(result.success).toBe(true);
      expect(gmailEditor.textContent).toContain('Friday at 3 PM is confirmed.');
    });

    it('returns an error when no editable composer is present on the page', () => {
      document.body.innerHTML = `<div>Read-only article page without any inputs.</div>`;

      const result = ContextHarvester.injectDraft('Test text', { doc: document });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active composer');
    });
  });
});
