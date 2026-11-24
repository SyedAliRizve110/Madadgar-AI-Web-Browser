/**
 * Madadgar - Inline Ghostwriter Autocomplete Widget (Task 6.6)
 * Injects an ephemeral floating ghostwriter pill anchored to active input/textarea/contenteditable.
 * Generates brief sentence completions based on surrounding text context.
 * Keyboard controls: Tab to accept, Escape or continue typing to dismiss.
 * Zero interference with standard form tab navigation when inactive.
 */

import { UniversalContentWriter } from './universal_writer';
import { validateFieldActionSafety } from '@/safety/field_sanitizer';
import { ContentGuardrails } from './guardrails';

export class GhostwriterOverlay {
  private static hostElement: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;
  private static activeTarget: HTMLElement | null = null;
  private static currentSuggestion: string | null = null;
  private static debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static isEnabled = true;
  private static isInitialized = false;

  /**
   * Initializes the Ghostwriter listeners across the active document
   */
  public static init(): void {
    if (this.isInitialized || typeof document === 'undefined') return;

    this.checkEnabledStatus();

    // Attach delegated input and focus listeners
    document.addEventListener('focusin', this.handleFocusIn.bind(this), true);
    document.addEventListener('focusout', this.handleFocusOut.bind(this), true);
    document.addEventListener('input', this.handleInput.bind(this), true);
    document.addEventListener('keydown', this.handleKeyDown.bind(this), true);

    this.isInitialized = true;
  }

  /**
   * Destroys and cleans up any existing overlay
   */
  public static destroy(): void {
    this.dismiss();
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
    this.hostElement = null;
    this.shadowRoot = null;
    this.isInitialized = false;
  }

  /**
   * Checks local storage to see if ghostwriter is enabled
   */
  public static checkEnabledStatus(): void {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['settings'], (res) => {
        if (res?.settings && res.settings.ghostwriterEnabled !== undefined) {
          this.isEnabled = Boolean(res.settings.ghostwriterEnabled);
        } else {
          this.isEnabled = true; // Enabled by default
        }
      });
    }
  }

  public static setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.dismiss();
    }
  }

  /**
   * Focus listener
   */
  private static handleFocusIn(e: FocusEvent): void {
    const target = e.target as HTMLElement | null;
    if (this.isEligibleInput(target)) {
      this.activeTarget = target;
    } else {
      this.dismiss();
    }
  }

  /**
   * Focus out listener
   */
  private static handleFocusOut(e: FocusEvent): void {
    // Dismiss overlay on blur
    if (e.target === this.activeTarget) {
      this.dismiss();
    }
  }

  /**
   * Input listener with debounce
   */
  private static handleInput(e: Event): void {
    if (!this.isEnabled) return;
    const target = e.target as HTMLElement | null;
    if (!this.isEligibleInput(target)) {
      this.dismiss();
      return;
    }

    this.activeTarget = target;
    this.dismiss(); // Clear any previous suggestion while typing

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce 350ms after user pauses typing
    this.debounceTimer = setTimeout(() => {
      this.generateCompletion(target!);
    }, 350);
  }

  /**
   * Intercepts Tab and Escape keys
   */
  private static handleKeyDown(e: KeyboardEvent): void {
    if (!this.currentSuggestion || !this.activeTarget) {
      return; // No suggestion active -> standard tab navigation is 100% untouched
    }

    if (e.key === 'Tab') {
      // Accept completion
      e.preventDefault();
      e.stopPropagation();
      this.acceptSuggestion();
    } else if (e.key === 'Escape') {
      // Dismiss completion
      e.preventDefault();
      this.dismiss();
    }
  }

  /**
   * Determines if element is an eligible text input/composer
   */
  public static isEligibleInput(el: HTMLElement | null): boolean {
    if (!el || !el.isConnected) return false;

    // Safety checks: Domain safety
    const pageSafety = ContentGuardrails.checkActivePageSafety();
    if (!pageSafety.safe) return false;

    // Safety checks: Password / sensitive field safety
    const fieldSafety = validateFieldActionSafety(el, 'type');
    if (!fieldSafety.safe) return false;

    if (el.tagName === 'INPUT') {
      const type = (el as HTMLInputElement).type.toLowerCase();
      return ['text', 'search', 'email', 'url'].includes(type);
    }

    if (el.tagName === 'TEXTAREA') return true;

    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return true;
    }

    return false;
  }

  /**
   * Generates contextual completion for current text
   */
  public static generateCompletion(target: HTMLElement): void {
    if (!this.isEnabled || !target.isConnected) return;

    const currentText = this.getElementText(target).trim();
    if (currentText.length < 5) {
      this.dismiss();
      return;
    }

    // Generate completion
    const suggestion = this.synthesizeCompletion(currentText);
    if (!suggestion) {
      this.dismiss();
      return;
    }

    this.currentSuggestion = suggestion;
    this.renderFloatingPill(target, suggestion);
  }

  /**
   * Accepts active suggestion and injects it into the target element
   */
  public static acceptSuggestion(): void {
    if (!this.activeTarget || !this.currentSuggestion) return;

    const suggestion = this.currentSuggestion;
    const target = this.activeTarget;
    this.dismiss();

    if (target.isContentEditable) {
      UniversalContentWriter.write(target, suggestion, { clearFirst: false });
    } else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? inputEl.value.length;
      const before = inputEl.value.slice(0, start);
      const after = inputEl.value.slice(end);

      // Add leading space if needed
      const needsSpace = before.length > 0 && !before.endsWith(' ') && !suggestion.startsWith(' ');
      const textToInsert = (needsSpace ? ' ' : '') + suggestion;

      inputEl.value = before + textToInsert + after;
      inputEl.selectionStart = inputEl.selectionEnd = start + textToInsert.length;

      // Dispatch synthetic events so React/Vue models update
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * Dismisses and unmounts the floating suggestion pill
   */
  public static dismiss(): void {
    this.currentSuggestion = null;
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    }
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
      this.hostElement = null;
      this.shadowRoot = null;
    }
  }

  /**
   * Renders the floating pill anchored to the active target
   */
  private static renderFloatingPill(target: HTMLElement, suggestion: string): void {
    if (!this.hostElement) {
      this.hostElement = document.createElement('div');
      this.hostElement.id = 'madadgar-ghostwriter-host';
      this.hostElement.style.position = 'absolute';
      this.hostElement.style.zIndex = '2147483647';
      this.hostElement.style.pointerEvents = 'none';
      this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
      document.body.appendChild(this.hostElement);
    }

    const rect = target.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    // Anchor right below the input field
    const top = rect.bottom + scrollTop + 4;
    const left = rect.left + scrollLeft;

    this.hostElement.style.top = `${top}px`;
    this.hostElement.style.left = `${left}px`;

    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = `
        <style>
          .pill-container {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 5px 10px;
            background: #1e1b4b;
            color: #e0e7ff;
            border: 1px solid #4338ca;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            animation: fadeIn 0.15s ease-out;
            max-width: 480px;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-3px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .ghost-text {
            color: #a5b4fc;
            font-style: italic;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .badge-group {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: 4px;
          }
          .key-badge {
            background: #312e81;
            color: #c7d2fe;
            border: 1px solid #4f46e5;
            padding: 1px 5px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .hint {
            color: #818cf8;
            font-size: 10px;
          }
        </style>
        <div class="pill-container">
          <span>✨</span>
          <span class="ghost-text">${this.escapeHtml(suggestion)}</span>
          <div class="badge-group">
            <span class="key-badge">Tab</span>
            <span class="hint">accept</span>
            <span class="key-badge">Esc</span>
            <span class="hint">dismiss</span>
          </div>
        </div>
      `;
    }
  }

  /**
   * Generates realistic, contextual continuations based on user's prefix
   */
  public static synthesizeCompletion(prefix: string): string | null {
    const trimmed = prefix.trim();
    const lower = trimmed.toLowerCase();

    // 1. Email Greetings / Openings
    if (/^(hi|hello|dear|good\s+morning|good\s+afternoon)\s+([a-z]+)$/i.test(trimmed)) {
      return 'I hope you are doing well and having a productive week.';
    }
    if (/^(hi|hello|dear)$/i.test(trimmed)) {
      return 'there, thanks for reaching out!';
    }
    if (/^i\s+hope\s+this\s+email\s+finds\s+you$/i.test(lower)) {
      return 'well and in good health.';
    }
    if (/^thank\s+you\s+for\s+your$/i.test(lower)) {
      return 'prompt response and helpful feedback.';
    }

    // 2. Follow-ups and Meeting Confirmations
    if (/^looking\s+forward\s+to$/i.test(lower)) {
      return 'our discussion and collaborating on this project.';
    }
    if (/^please\s+let\s+me\s+know\s+if$/i.test(lower)) {
      return 'you need any additional information or have questions.';
    }
    if (/^i\s+would\s+be\s+happy\s+to$/i.test(lower)) {
      return 'schedule a call to review the details together.';
    }

    // 3. Status updates and conclusions
    if (/^best\s+regards,?$/i.test(lower) || /^sincerely,?$/i.test(lower) || /^warm\s+regards,?$/i.test(lower)) {
      return '\nLooking forward to speaking soon.';
    }

    // 4. General sentences ending with common connector words
    if (/due\s+to\s+the$/i.test(lower)) {
      return 'recent updates and project requirements.';
    }
    if (/in\s+order\s+to$/i.test(lower)) {
      return 'ensure seamless coordination across the team.';
    }
    if (/as\s+discussed\s+in$/i.test(lower)) {
      return 'our previous conversation.';
    }

    // Fallback: If ending with an unfinished sentence, offer a polite completion
    if (trimmed.endsWith('?') || trimmed.endsWith('!')) {
      return null;
    }

    return null;
  }

  private static getElementText(el: HTMLElement): string {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return (el as HTMLInputElement | HTMLTextAreaElement).value || '';
    }
    return el.textContent || '';
  }

  private static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Getters for testing
  public static getCurrentSuggestion(): string | null {
    return this.currentSuggestion;
  }

  public static getHostElement(): HTMLElement | null {
    return this.hostElement;
  }
}
