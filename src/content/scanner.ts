/**
 * Madadgar - Interactive DOM Scanner & Unique Indexer (Task 3.1)
 * Traverses visible interactive elements (buttons, links, inputs, selects, textareas),
 * filters non-visible/hidden elements, extracts rich semantic properties,
 * assigns sequential numeric IDs, and maintains an in-memory element registry.
 */

import type { ScannedElement, ScannedElementRect } from '@/common/types';

/**
 * Target CSS selectors for interactive DOM elements
 */
export const INTERACTIVE_SELECTORS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[tabindex="0"]',
  '[contenteditable="true"]',
  'summary',
].join(', ');

export interface ScanOptions {
  /** If true, includes elements even with 0x0 rect (useful in jsdom unit test environments) */
  allowZeroRectInTest?: boolean;
  /** Max elements to index to prevent DOM bloating */
  maxElements?: number;
}

export class DOMScanner {
  private static elementRegistry = new Map<number, HTMLElement>();
  private static observer: MutationObserver | null = null;
  private static lastScannedElements: ScannedElement[] = [];

  /**
   * Clears the element registry and attributes from previous scan
   */
  public static clear(): void {
    for (const el of this.elementRegistry.values()) {
      try {
        el.removeAttribute('data-madadgar-id');
      } catch {
        // Element might have been removed from DOM
      }
    }
    this.elementRegistry.clear();
    this.lastScannedElements = [];
  }

  /**
   * Retrieves an interactive HTMLElement by its assigned numeric ID
   */
  public static getElementById(id: number): HTMLElement | null {
    const el = this.elementRegistry.get(id);
    if (!el || !el.isConnected) {
      if (typeof document !== 'undefined') {
        const found = document.querySelector(`[data-madadgar-id="${id}"]`) as HTMLElement | null;
        if (found && found.isConnected) {
          this.elementRegistry.set(id, found);
          return found;
        }
      }
      return null;
    }
    return el;
  }

  /**
   * Retrieves all currently registered elements
   */
  public static getRegistry(): Map<number, HTMLElement> {
    return new Map(this.elementRegistry);
  }

  /**
   * Retrieves the latest scanned element metadata list
   */
  public static getLastScannedElements(): ScannedElement[] {
    return [...this.lastScannedElements];
  }

  /**
   * Checks if an element is genuinely visible to the user
   */
  public static isElementVisible(el: HTMLElement, allowZeroRect = false): boolean {
    if (!el || !el.isConnected) {
      return false;
    }

    // Never index Madadgar's own overlays or UI
    if (
      el.id === 'madadgar-overlay-host' ||
      el.id === 'madadgar-overlay-root' ||
      el.hasAttribute('data-madadgar-overlay') ||
      el.closest('#madadgar-overlay-host')
    ) {
      return false;
    }

    // Check computed styles
    const isJsdom =
      typeof window !== 'undefined' &&
      (window.navigator?.userAgent?.includes('jsdom') ||
       process.env?.VITEST === 'true' ||
       process.env?.NODE_ENV === 'test');

    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        parseFloat(style.opacity || '1') === 0
      ) {
        return false;
      }

      // Check offsetParent (null indicates hidden element, unless position is fixed or sticky)
      if (
        !isJsdom &&
        el.offsetParent === null &&
        style.position !== 'fixed' &&
        style.position !== 'sticky' &&
        el.tagName !== 'BODY' &&
        el.tagName !== 'HTML'
      ) {
        if (!allowZeroRect) {
          return false;
        }
      }
    }

    // Check bounding client rectangle
    const rect = el.getBoundingClientRect();
    if (!allowZeroRect && !isJsdom && (rect.width <= 0 || rect.height <= 0)) {
      return false;
    }

    // Check if element is collapsed or scrolled far beyond reasonable dimensions
    if (!allowZeroRect && (rect.bottom < -5000 || rect.top > 150000)) {
      return false;
    }

    return true;
  }

  /**
   * Extracts a descriptive label for an element from its associated labels, ARIA tags, or text
   */
  public static extractLabel(el: HTMLElement): string {
    // 1. Check aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    // 2. Check aria-labelledby
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl && labelEl.textContent?.trim()) {
        return labelEl.textContent.trim();
      }
    }

    // 3. For form elements, check associated <label for="...">
    if (el.id) {
      const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelFor && labelFor.textContent?.trim()) {
        return labelFor.textContent.trim();
      }
    }

    // 4. Check enclosing <label>
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent?.trim()) {
      // Remove element's own value text if inside
      const labelClone = parentLabel.cloneNode(true) as HTMLElement;
      for (const input of labelClone.querySelectorAll('input, select, textarea')) {
        input.remove();
      }
      const labelText = labelClone.textContent?.trim();
      if (labelText) return labelText;
    }

    // 5. Placeholder attribute
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) {
      return placeholder.trim();
    }

    // 6. Title attribute
    const title = el.getAttribute('title');
    if (title && title.trim()) {
      return title.trim();
    }

    // 7. Value attribute on submit/button inputs
    if (el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'button')) {
      if (el.value && el.value.trim()) return el.value.trim();
    }

    // 8. Text content for buttons, links, etc.
    const textContent = el.innerText || el.textContent;
    if (textContent && textContent.trim()) {
      // Clean up multiple whitespace / line breaks
      return textContent.replace(/\s+/g, ' ').trim().slice(0, 100);
    }

    // 9. Name attribute as fallback
    const name = el.getAttribute('name');
    if (name && name.trim()) {
      return name.trim();
    }

    return '';
  }

  /**
   * Retrieves current text value of the element
   */
  public static extractCurrentValue(el: HTMLElement): string {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        return el.checked ? 'checked' : 'unchecked';
      }
      if (el.type === 'password') {
        return el.value ? '••••••••' : '';
      }
      return el.value || '';
    }

    if (el instanceof HTMLTextAreaElement) {
      return el.value || '';
    }

    if (el instanceof HTMLSelectElement) {
      const selectedOption = el.options[el.selectedIndex];
      return selectedOption?.text || el.value || '';
    }

    if (el.isContentEditable) {
      return el.textContent?.trim() || '';
    }

    return '';
  }

  /**
   * Determines if this element is considered a password or highly sensitive input
   */
  public static isPasswordElement(el: HTMLElement): boolean {
    if (el instanceof HTMLInputElement && el.type === 'password') {
      return true;
    }
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (autocomplete.includes('current-password') || autocomplete.includes('new-password')) {
      return true;
    }
    return false;
  }

  /**
   * Identifies potentially consequential buttons (submit, pay, delete, etc.)
   */
  public static isConsequentialElement(el: HTMLElement, labelText: string): boolean {
    const textToCheck = `${labelText} ${el.getAttribute('type') || ''} ${el.getAttribute('name') || ''}`.toLowerCase();
    const consequentialRegex = /(\b(submit|pay|buy|purchase|delete|remove|transfer|place order|confirm order|checkout|cancel subscription)\b)/i;
    return consequentialRegex.test(textToCheck);
  }

  /**
   * Performs the full DOM scan and returns the sequential ScannedElement array
   */
  public static scan(doc: Document = document, options: ScanOptions = {}): ScannedElement[] {
    this.clear();

    const isTestEnv =
      typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');
    const allowZeroRect = options.allowZeroRectInTest ?? isTestEnv;
    const maxElements = options.maxElements ?? 250;

    const rawElements = doc.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTORS);
    const scannedList: ScannedElement[] = [];
    let nextId = 1;

    for (let i = 0; i < rawElements.length; i++) {
      if (scannedList.length >= maxElements) {
        break;
      }

      const el = rawElements[i];

      if (!this.isElementVisible(el, allowZeroRect)) {
        continue;
      }

      const id = nextId++;
      el.setAttribute('data-madadgar-id', String(id));
      this.elementRegistry.set(id, el);

      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || (tag === 'input' ? 'text' : undefined);
      const name = el.getAttribute('name') || undefined;
      const placeholder = el.getAttribute('placeholder') || undefined;
      const role = el.getAttribute('role') || undefined;
      const href = el.getAttribute('href') || undefined;
      const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
      const label = this.extractLabel(el);
      const currentValue = this.extractCurrentValue(el);
      const isPassword = this.isPasswordElement(el);
      const isConsequential = this.isConsequentialElement(el, label);

      const rawRect = el.getBoundingClientRect();
      const rect: ScannedElementRect = {
        top: Math.round(rawRect.top),
        left: Math.round(rawRect.left),
        width: Math.round(rawRect.width),
        height: Math.round(rawRect.height),
        bottom: Math.round(rawRect.bottom),
        right: Math.round(rawRect.right),
      };

      const item: ScannedElement = {
        id,
        tag,
        type,
        name,
        label: label || undefined,
        placeholder,
        currentValue: currentValue || undefined,
        text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100) || undefined,
        role,
        href,
        disabled: disabled || undefined,
        isPassword: isPassword || undefined,
        isConsequential: Boolean(isConsequential),
        rect,
      };

      scannedList.push(item);
    }

    this.lastScannedElements = scannedList;
    return scannedList;
  }

  /**
   * Attaches a debounced MutationObserver to detect significant SPA page changes
   */
  public static attachObserver(onMutation: () => void, debounceMs = 400): () => void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (typeof MutationObserver === 'undefined') {
      return () => {};
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;

    this.observer = new MutationObserver((mutations) => {
      // Ignore mutations created by our own overlay
      const isOurMutation = mutations.every((m) => {
        const target = m.target as HTMLElement;
        return (
          target?.id === 'madadgar-overlay-host' ||
          target?.id === 'madadgar-overlay-root' ||
          target?.hasAttribute?.('data-madadgar-overlay')
        );
      });

      if (isOurMutation) return;

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        onMutation();
      }, debounceMs);
    });

    try {
      this.observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'disabled'],
      });
    } catch {
      // Ignore observation failure in restricted documents
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    };
  }
}
