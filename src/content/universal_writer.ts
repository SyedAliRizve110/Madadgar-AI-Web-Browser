/**
 * Madadgar - Universal contenteditable Rich Text Injector (Task 6.4)
 * Reliable synthetic text injection for modern web apps & rich-text editors
 * (Gmail, LinkedIn, X/Twitter, Notion, ProseMirror, Lexical, Draft.js, Quill, Tiptap)
 * ensuring framework state synchronization without caret loss or corrupting virtual DOM trees.
 */

export interface UniversalWriterOptions {
  clearFirst?: boolean;
  append?: boolean;
}

export class UniversalContentWriter {
  /**
   * Detects whether an element is a rich-text / contenteditable editor
   * across major modern web frameworks.
   */
  public static isContentEditableTarget(el: HTMLElement): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;

    // 1. Native contenteditable attribute or property
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return true;
    }

    // 2. ARIA role textbox with contenteditable or tabindex
    if (el.getAttribute('role') === 'textbox' && el.getAttribute('contenteditable') !== 'false') {
      return true;
    }

    // 3. Known rich-text editor framework selectors
    if (
      el.matches?.(
        '.ProseMirror, [data-lexical-editor], .DraftEditor-root, .DraftEditor-editorContainer, .public-DraftEditor-content, .ql-editor, [data-testid="tweetTextarea_0"], .notion-page-content, [data-slate-editor], .tiptap'
      )
    ) {
      return true;
    }

    // Check if element is inside a rich editor container
    const parentEditor = el.closest(
      '.ProseMirror, [data-lexical-editor], .DraftEditor-root, .public-DraftEditor-content, .ql-editor, [data-testid="tweetTextarea_0"], [contenteditable="true"]'
    );
    return Boolean(parentEditor);
  }

  /**
   * Detects the specific rich-text editor or form element type
   */
  public static detectEditorType(el: HTMLElement): string {
    if (!el) return 'none';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (el.tagName === 'INPUT') return 'input';
    if (el.matches?.('.ProseMirror') || el.closest?.('.ProseMirror')) return 'ProseMirror';
    if (el.matches?.('[data-lexical-editor]') || el.closest?.('[data-lexical-editor]')) return 'Lexical';
    if (el.matches?.('.DraftEditor-root') || el.closest?.('.DraftEditor-root')) return 'Draft.js';
    if (el.matches?.('.ql-editor') || el.closest?.('.ql-editor')) return 'Quill';
    if (el.matches?.('[data-testid="tweetTextarea_0"]') || el.closest?.('[data-testid="tweetTextarea_0"]')) return 'Twitter';
    if (el.matches?.('.Am.Al.editable') || el.closest?.('.Am.Al.editable')) return 'Gmail';
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return 'contenteditable';
    return 'generic';
  }

  /**
   * Injects text into a rich-text or contenteditable element with caret positioning
   * and synthetic beforeinput / input / change events.
   */
  public static write(el: HTMLElement, text: string, options: UniversalWriterOptions = {}): boolean {
    if (!el) {
      throw new Error('Target element is null or undefined.');
    }

    // Resolve exact editable element if parent was passed
    const editableTarget: HTMLElement =
      el.isContentEditable || el.getAttribute('contenteditable') === 'true'
        ? el
        : (el.querySelector('[contenteditable="true"], .ProseMirror, .ql-editor, [role="textbox"]') as HTMLElement) || el;

    // 1. Scroll target into view and focus
    if (typeof editableTarget.scrollIntoView === 'function') {
      try {
        editableTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {
        // Fallback for older environments
      }
    }

    if (typeof editableTarget.focus === 'function') {
      try {
        editableTarget.focus({ preventScroll: true });
      } catch {
        editableTarget.focus();
      }
    }

    // 2. Optional: Clear existing content if clearFirst requested
    if (options.clearFirst) {
      try {
        editableTarget.innerHTML = '';
      } catch {
        editableTarget.textContent = '';
      }
    }

    // 3. Set caret position using window.getSelection() and document.createRange()
    const doc = editableTarget.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null);

    if (win && doc && typeof win.getSelection === 'function' && typeof doc.createRange === 'function') {
      const selection = win.getSelection();
      if (selection) {
        const range = doc.createRange();

        if (options.append && editableTarget.childNodes.length > 0) {
          // Place caret at the very end
          range.selectNodeContents(editableTarget);
          range.collapse(false); // false collapses to end
        } else {
          // Select all or collapse to start/end based on current state
          range.selectNodeContents(editableTarget);
          if (!options.clearFirst && editableTarget.childNodes.length > 0) {
            range.collapse(false);
          }
        }

        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    // 4. Dispatch synthetic beforeinput event (critical for Lexical, Draft.js, ProseMirror)
    let beforeInputDefaultPrevented = false;

    if (win && typeof (win as any).InputEvent === 'function') {
      try {
        const beforeInputEvent = new (win as any).InputEvent('beforeinput', {
          inputType: 'insertText',
          data: text,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        beforeInputDefaultPrevented = !editableTarget.dispatchEvent(beforeInputEvent);
      } catch {
        // Fallback if InputEvent constructor fails
      }
    }

    // 5. Execute document.execCommand('insertText') if beforeinput was not default-prevented
    let execCommandSucceeded = false;
    if (!beforeInputDefaultPrevented && doc && typeof doc.execCommand === 'function') {
      try {
        execCommandSucceeded = doc.execCommand('insertText', false, text);
      } catch {
        execCommandSucceeded = false;
      }
    }

    // 6. Fallback Text Node Insertion if execCommand did not insert or is unsupported
    if (!execCommandSucceeded) {
      if (win && doc && typeof win.getSelection === 'function') {
        const selection = win.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = doc.createTextNode(text);
          range.insertNode(textNode);

          // Move caret after inserted text node
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          editableTarget.textContent = (editableTarget.textContent || '') + text;
        }
      } else {
        editableTarget.textContent = (editableTarget.textContent || '') + text;
      }
    }

    // 7. Dispatch synthetic input and change events for framework state synchronization
    if (win) {
      try {
        const inputEvent =
          typeof (win as any).InputEvent === 'function'
            ? new (win as any).InputEvent('input', {
                inputType: 'insertText',
                data: text,
                bubbles: true,
                cancelable: true,
                composed: true,
              })
            : new Event('input', { bubbles: true, cancelable: true });

        editableTarget.dispatchEvent(inputEvent);
        editableTarget.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

        // Trigger key events for listeners requiring keyup confirmation (e.g. char counters)
        editableTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true }));
        editableTarget.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', bubbles: true }));
      } catch {
        // Ignore fallback event errors
      }
    }

    return true;
  }
}
