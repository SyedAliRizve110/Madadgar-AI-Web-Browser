/**
 * Madadgar - Safe Synthetic Event Action Executor (Task 3.5)
 * Dispatches realistic synthetic user interaction events (click, type, select, scroll)
 * respecting React/Vue synthetic event models and user safety constraints.
 */

import { DOMScanner } from './scanner';
import { BadgeOverlay } from './overlay';
import { validateFieldActionSafety } from '@/safety/field_sanitizer';
import { UniversalContentWriter } from './universal_writer';
import type { AgentActionProposal, ExecuteActionResponse, ActionPreSnapshot } from '@/common/types';

export class ActionExecutor {
  /**
   * Main entry point to execute an approved action proposal
   */
  public static async execute(
    proposal: AgentActionProposal,
    dryRun = false
  ): Promise<ExecuteActionResponse> {
    const { action, target_id, value, reason } = proposal;

    // 1. Task Completed
    if (action === 'done') {
      return {
        success: true,
        action: 'done',
        value,
      };
    }

    // 2. Task Failed / AI Abort
    if (action === 'fail') {
      return {
        success: false,
        action: 'fail',
        error: reason || 'Task marked as failed by agent planner.',
      };
    }

    // 3. Global Scroll without a specific target
    if (action === 'scroll' && (target_id === undefined || target_id === null)) {
      const preSnapshot: ActionPreSnapshot = {
        action: 'scroll',
        previousScroll: {
          x: typeof window !== 'undefined' ? window.scrollX || 0 : 0,
          y: typeof window !== 'undefined' ? window.scrollY || 0 : 0,
        },
        timestamp: Date.now(),
      };
      const success = this.executeScroll(null, value || 'down');
      return {
        success,
        action: 'scroll',
        value: value || 'down',
        preSnapshot,
      };
    }

    // 4. Resolve Target Element
    if (typeof target_id !== 'number') {
      return {
        success: false,
        action,
        error: `Action "${action}" requires a numeric target_id, but none was provided.`,
      };
    }

    const liveEl = DOMScanner.getElementById(target_id);
    if (!liveEl || !liveEl.isConnected) {
      return {
        success: false,
        action,
        targetId: target_id,
        error: `Target element #${target_id} is no longer attached to the document.`,
      };
    }

    // 5. Credential & Sensitive Field Shield (Task 4.4.2)
    const fieldSafety = validateFieldActionSafety(liveEl, action);
    if (!fieldSafety.safe) {
      return {
        success: false,
        action,
        targetId: target_id,
        error: fieldSafety.reason || 'Blocked by credential safety guardrail.',
      };
    }

    // 6. Dry-run Mode: highlight with dry-run outline and exit without dispatching mutation events
    if (dryRun) {
      BadgeOverlay.highlightTarget(target_id, 'dry-run', true);
      return {
        success: true,
        action,
        targetId: target_id,
        value,
        dryRun: true,
      };
    }

    // 6. Capture Pre-action Snapshot for Undo / Rollback (Task 6.7)
    let preSnapshot: ActionPreSnapshot | undefined;
    if (action === 'type' || action === 'select') {
      let previousValue = '';
      if (liveEl.tagName === 'INPUT' || liveEl.tagName === 'TEXTAREA') {
        previousValue = (liveEl as HTMLInputElement | HTMLTextAreaElement).value || '';
      } else if (liveEl.isContentEditable) {
        previousValue = liveEl.textContent || '';
      }
      preSnapshot = {
        targetId: target_id,
        action,
        previousValue,
        timestamp: Date.now(),
      };
    } else if (action === 'scroll') {
      preSnapshot = {
        targetId: target_id,
        action: 'scroll',
        previousScroll: {
          x: typeof window !== 'undefined' ? window.scrollX || 0 : 0,
          y: typeof window !== 'undefined' ? window.scrollY || 0 : 0,
        },
        timestamp: Date.now(),
      };
    }

    // 7. Execute Specific Action
    try {
      switch (action) {
        case 'click': {
          const success = this.executeClick(liveEl);
          return {
            success,
            action: 'click',
            targetId: target_id,
          };
        }

        case 'type': {
          const textToType = value ?? '';
          const success = this.executeType(liveEl, textToType);
          return {
            success,
            action: 'type',
            targetId: target_id,
            value: textToType,
            preSnapshot,
          };
        }

        case 'select': {
          const selectVal = value ?? '';
          const success = this.executeSelect(liveEl, selectVal);
          return {
            success,
            action: 'select',
            targetId: target_id,
            value: selectVal,
            preSnapshot,
          };
        }

        case 'scroll': {
          const success = this.executeScroll(liveEl, value || 'down');
          return {
            success,
            action: 'scroll',
            targetId: target_id,
            value: value || 'down',
            preSnapshot,
          };
        }

        default:
          return {
            success: false,
            action,
            targetId: target_id,
            error: `Unsupported action type: "${action}"`,
          };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        action,
        targetId: target_id,
        error: `Execution error on #${target_id}: ${errorMsg}`,
      };
    }
  }

  /**
   * Executes a realistic synthetic click sequence: mousedown -> mouseup -> click
   */
  public static executeClick(el: HTMLElement): boolean {
    if (this.isElementDisabled(el)) {
      throw new Error('Element is disabled or aria-disabled.');
    }

    // Scroll into view
    if (typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {
        // Fallback for older DOMs
      }
    }

    // Focus target
    if (typeof el.focus === 'function') {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }

    // Dispatch realistic mouse events
    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
    };

    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));

    // Native click triggers submit, navigation, and framework click handlers
    if (typeof el.click === 'function') {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent('click', opts));
    }

    // For form submit buttons, additionally invoke requestSubmit() or dispatch submit event
    try {
      const form = (el as any).form || el.closest('form');
      const isSubmit =
        (el as HTMLInputElement).type === 'submit' ||
        el.getAttribute('type') === 'submit' ||
        (el.tagName.toLowerCase() === 'button' && (!el.getAttribute('type') || el.getAttribute('type') === 'submit'));

      if (form && isSubmit) {
        if (typeof form.requestSubmit === 'function') {
          try {
            form.requestSubmit(el);
          } catch {
            try {
              HTMLFormElement.prototype.submit.call(form);
            } catch {
              form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
          }
        } else {
          try {
            HTMLFormElement.prototype.submit.call(form);
          } catch {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }
      }
    } catch {
      // Ignored if validation blocks submission or form already submitted
    }

    return true;
  }

  /**
   * Executes safe typing into inputs, textareas, and contenteditables
   * Overcomes React/Vue overridden value setters by invoking the native prototype setter.
   */
  public static executeType(el: HTMLElement, text: string): boolean {
    if (this.isElementDisabled(el)) {
      throw new Error('Element is disabled.');
    }

    const tagName = el.tagName.toLowerCase();
    const isInput = tagName === 'input';
    const isTextarea = tagName === 'textarea';
    const isContentEditable = el.isContentEditable || UniversalContentWriter.isContentEditableTarget(el);

    if (!isInput && !isTextarea && !isContentEditable) {
      throw new Error(`Cannot type into element with tag <${tagName}>.`);
    }

    // Check readonly
    if ((el as HTMLInputElement).readOnly) {
      throw new Error('Cannot type into read-only element.');
    }

    // Universal rich-text / contenteditable injection (Task 6.4)
    if (isContentEditable) {
      return UniversalContentWriter.write(el, text);
    }

    // Focus target
    if (typeof el.focus === 'function') {
      el.focus();
    }

    if (isInput) {
      const inputEl = el as HTMLInputElement;
      const proto = typeof window !== 'undefined' ? window.HTMLInputElement.prototype : null;
      const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;

      if (nativeSetter) {
        nativeSetter.call(inputEl, text);
      } else {
        inputEl.value = text;
      }
    } else if (isTextarea) {
      const textareaEl = el as HTMLTextAreaElement;
      const proto = typeof window !== 'undefined' ? window.HTMLTextAreaElement.prototype : null;
      const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;

      if (nativeSetter) {
        nativeSetter.call(textareaEl, text);
      } else {
        textareaEl.value = text;
      }
    }

    // Dispatch input, change, and blur events so reactive frameworks detect value update
    const eventOpts: EventInit = { bubbles: true, cancelable: true, composed: true };

    el.dispatchEvent(new Event('input', eventOpts));
    el.dispatchEvent(new Event('change', eventOpts));

    return true;
  }

  /**
   * Selects an option inside a <select> element by value or visible label text
   */
  public static executeSelect(el: HTMLElement, targetValue: string): boolean {
    if (el.tagName.toLowerCase() !== 'select') {
      throw new Error(`Target element is <${el.tagName.toLowerCase()}>, expected <select>.`);
    }

    if (this.isElementDisabled(el)) {
      throw new Error('Select element is disabled.');
    }

    const selectEl = el as HTMLSelectElement;
    const trimmed = targetValue.trim().toLowerCase();
    let matchedIndex = -1;

    for (let i = 0; i < selectEl.options.length; i++) {
      const opt = selectEl.options[i];
      const val = opt.value.trim().toLowerCase();
      const txt = opt.text.trim().toLowerCase();

      if (val === trimmed || txt === trimmed || txt.includes(trimmed)) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      throw new Error(
        `Option matching "${targetValue}" was not found in <select> dropdown.`
      );
    }

    selectEl.selectedIndex = matchedIndex;

    const eventOpts: EventInit = { bubbles: true, cancelable: true };
    selectEl.dispatchEvent(new Event('input', eventOpts));
    selectEl.dispatchEvent(new Event('change', eventOpts));

    return true;
  }

  /**
   * Scrolls the page or an element in a given direction
   */
  public static executeScroll(
    el?: HTMLElement | null,
    direction: string = 'down'
  ): boolean {
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      } catch {
        el.scrollIntoView();
        return true;
      }
    }

    if (typeof window === 'undefined') return false;

    const dir = direction.toLowerCase();
    const distance = 450;

    switch (dir) {
      case 'up':
        window.scrollBy({ top: -distance, behavior: 'smooth' });
        break;
      case 'down':
        window.scrollBy({ top: distance, behavior: 'smooth' });
        break;
      case 'half_up':
      case 'half page up':
        window.scrollBy({ top: -250, behavior: 'smooth' });
        break;
      case 'half_down':
      case 'half page down':
        window.scrollBy({ top: 250, behavior: 'smooth' });
        break;
      case 'top':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'bottom':
        window.scrollTo({
          top: document.body?.scrollHeight || document.documentElement?.scrollHeight || 10000,
          behavior: 'smooth',
        });
        break;
      default: {
        const num = parseInt(direction, 10);
        if (!isNaN(num)) {
          window.scrollBy({ top: num, behavior: 'smooth' });
        } else {
          window.scrollBy({ top: distance, behavior: 'smooth' });
        }
      }
    }

    return true;
  }

  /**
   * Fast-path: Directly clicks an element by its numeric badge ID (Task 6.3)
   */
  public static executeBadgeClick(badgeId: number): boolean {
    const el = DOMScanner.getElementById(badgeId);
    if (!el || !el.isConnected) {
      throw new Error(`Target element for badge #${badgeId} not found or no longer attached.`);
    }
    return this.executeClick(el);
  }

  /**
   * Fast-path: Directly clicks an element matching target text or label (Task 6.3)
   */
  public static executeClickByText(targetText: string): boolean {
    const trimmed = targetText.trim().toLowerCase();
    if (!trimmed) return false;

    // First search indexed scanned elements
    const elements = DOMScanner.getLastScannedElements();
    const matched = elements.find(
      (e) => (e.label && e.label.toLowerCase().includes(trimmed)) || (e.placeholder && e.placeholder.toLowerCase().includes(trimmed))
    );

    if (matched) {
      const el = DOMScanner.getElementById(matched.id);
      if (el && el.isConnected) {
        return this.executeClick(el);
      }
    }

    // Fallback search live DOM interactive elements (buttons, links, inputs)
    if (typeof document !== 'undefined') {
      const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"]')) as HTMLElement[];
      for (const cand of candidates) {
        const text = (cand.innerText || cand.textContent || cand.getAttribute('aria-label') || (cand as HTMLInputElement).value || '').trim().toLowerCase();
        if (text === trimmed || text.includes(trimmed)) {
          return this.executeClick(cand);
        }
      }
    }

    throw new Error(`No interactive element matching text "${targetText}" found.`);
  }

  /**
   * Action Rollback Dispatcher: restores an element's pre-action state (Task 6.7)
   */
  public static executeUndo(snapshot: ActionPreSnapshot): { success: boolean; error?: string } {
    if (!snapshot) {
      return { success: false, error: 'No snapshot provided to undo.' };
    }

    if (snapshot.action === 'type' || snapshot.action === 'select') {
      if (typeof snapshot.targetId !== 'number') {
        return { success: false, error: 'Snapshot lacks targetId.' };
      }
      const liveEl = DOMScanner.getElementById(snapshot.targetId);
      if (!liveEl || !liveEl.isConnected) {
        return { success: false, error: `Target element #${snapshot.targetId} is no longer connected.` };
      }

      const valToRestore = snapshot.previousValue ?? '';
      if (
        liveEl.isContentEditable ||
        liveEl.getAttribute('contenteditable') === 'true' ||
        UniversalContentWriter.isContentEditableTarget(liveEl)
      ) {
        liveEl.innerHTML = '';
        UniversalContentWriter.write(liveEl, valToRestore, { clearFirst: true });
        if (liveEl.textContent !== valToRestore) {
          liveEl.textContent = valToRestore;
        }
      } else if (liveEl.tagName === 'INPUT' || liveEl.tagName === 'TEXTAREA') {
        const inputEl = liveEl as HTMLInputElement | HTMLTextAreaElement;
        inputEl.focus();
        inputEl.value = valToRestore;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { success: true };
    }

    if (snapshot.action === 'scroll' && snapshot.previousScroll) {
      if (typeof window !== 'undefined' && window.scrollTo) {
        window.scrollTo(snapshot.previousScroll.x, snapshot.previousScroll.y);
        return { success: true };
      }
    }

    return { success: false, error: `Cannot undo action of type ${snapshot.action}.` };
  }

  /**
   * Checks whether an element is disabled or aria-disabled
   */
  private static isElementDisabled(el: HTMLElement): boolean {
    if ((el as any).disabled === true) return true;
    if (el.getAttribute('aria-disabled') === 'true') return true;
    if (el.classList.contains('disabled')) return true;
    return false;
  }
}
