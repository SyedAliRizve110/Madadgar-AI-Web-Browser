// @vitest-environment jsdom
/**
 * Inline Ghostwriter Autocomplete Widget Tests (Task 6.6)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GhostwriterOverlay } from '@/content/ghostwriter_overlay';

describe('Inline Ghostwriter Autocomplete Widget (Task 6.6)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    GhostwriterOverlay.destroy();
    GhostwriterOverlay.init();
    GhostwriterOverlay.setEnabled(true);
  });

  afterEach(() => {
    GhostwriterOverlay.destroy();
  });

  describe('Contextual Autocomplete Synthesis', () => {
    it('synthesizes polite opening completion for greetings', () => {
      const suggestion = GhostwriterOverlay.synthesizeCompletion('Hi Sarah');
      expect(suggestion).toContain('I hope you are doing well');
    });

    it('synthesizes meeting follow-up completion', () => {
      const suggestion = GhostwriterOverlay.synthesizeCompletion('looking forward to');
      expect(suggestion).toContain('our discussion');
    });

    it('synthesizes question conclusion completion', () => {
      const suggestion = GhostwriterOverlay.synthesizeCompletion('please let me know if');
      expect(suggestion).toContain('you need any additional information');
    });

    it('returns null for completed punctuation questions', () => {
      const suggestion = GhostwriterOverlay.synthesizeCompletion('What time is the meeting?');
      expect(suggestion).toBeNull();
    });
  });

  describe('Safety & Eligibility Boundaries', () => {
    it('strictly denies eligibility on password or sensitive fields', () => {
      const pwd = document.createElement('input');
      pwd.type = 'password';
      pwd.name = 'user_password';
      document.body.appendChild(pwd);

      expect(GhostwriterOverlay.isEligibleInput(pwd)).toBe(false);
    });

    it('denies eligibility on disconnected elements', () => {
      const disconnected = document.createElement('input');
      disconnected.type = 'text';
      expect(GhostwriterOverlay.isEligibleInput(disconnected)).toBe(false);
    });

    it('allows standard text, textarea, and contenteditable elements', () => {
      const input = document.createElement('input');
      input.type = 'text';
      const textarea = document.createElement('textarea');
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');

      document.body.appendChild(input);
      document.body.appendChild(textarea);
      document.body.appendChild(editable);

      expect(GhostwriterOverlay.isEligibleInput(input)).toBe(true);
      expect(GhostwriterOverlay.isEligibleInput(textarea)).toBe(true);
      expect(GhostwriterOverlay.isEligibleInput(editable)).toBe(true);
    });
  });

  describe('Overlay Lifecycle & Keyboard Interception', () => {
    it('renders floating shadow DOM pill when suggestion is generated', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Hi Team';
      document.body.appendChild(input);

      GhostwriterOverlay.generateCompletion(input);

      const host = GhostwriterOverlay.getHostElement();
      expect(host).not.toBeNull();
      expect(GhostwriterOverlay.getCurrentSuggestion()).toContain('I hope you are doing well');
    });

    it('accepts suggestion on Tab and inserts text into input without default tab navigation', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Hi Team';
      document.body.appendChild(input);
      input.focus();

      GhostwriterOverlay.generateCompletion(input);
      expect(GhostwriterOverlay.getCurrentSuggestion()).not.toBeNull();

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(tabEvent, 'preventDefault');

      document.dispatchEvent(tabEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(input.value).toContain('Hi Team I hope you are doing well');
      expect(GhostwriterOverlay.getCurrentSuggestion()).toBeNull();
    });

    it('dismisses suggestion on Escape key', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'looking forward to';
      document.body.appendChild(input);
      input.focus();

      GhostwriterOverlay.generateCompletion(input);
      expect(GhostwriterOverlay.getCurrentSuggestion()).not.toBeNull();

      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(escEvent);
      expect(GhostwriterOverlay.getCurrentSuggestion()).toBeNull();
    });

    it('does not intercept Tab when no suggestion is active (zero interference)', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = '';
      document.body.appendChild(input);
      input.focus();

      const tabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(tabEvent, 'preventDefault');

      document.dispatchEvent(tabEvent);
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });
});
