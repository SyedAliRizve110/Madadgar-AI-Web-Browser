// @vitest-environment jsdom
/**
 * Universal contenteditable Rich Text Injector Tests (Task 6.4)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UniversalContentWriter } from '@/content/universal_writer';
import { ActionExecutor } from '@/content/executor';

describe('Universal contenteditable Rich Text Injector (Task 6.4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('isContentEditableTarget Detection', () => {
    it('detects native contenteditable="true" elements', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      expect(UniversalContentWriter.isContentEditableTarget(div)).toBe(true);
    });

    it('detects ARIA role="textbox" rich elements', () => {
      const div = document.createElement('div');
      div.setAttribute('role', 'textbox');
      expect(UniversalContentWriter.isContentEditableTarget(div)).toBe(true);
    });

    it('detects ProseMirror editors', () => {
      const pmDiv = document.createElement('div');
      pmDiv.className = 'ProseMirror';
      expect(UniversalContentWriter.isContentEditableTarget(pmDiv)).toBe(true);
    });

    it('detects Lexical editors', () => {
      const lexicalDiv = document.createElement('div');
      lexicalDiv.setAttribute('data-lexical-editor', 'true');
      expect(UniversalContentWriter.isContentEditableTarget(lexicalDiv)).toBe(true);
    });

    it('detects Draft.js & Quill editors', () => {
      const draftDiv = document.createElement('div');
      draftDiv.className = 'DraftEditor-root';
      expect(UniversalContentWriter.isContentEditableTarget(draftDiv)).toBe(true);

      const quillDiv = document.createElement('div');
      quillDiv.className = 'ql-editor';
      expect(UniversalContentWriter.isContentEditableTarget(quillDiv)).toBe(true);
    });

    it('returns false for standard text inputs and non-editable divs', () => {
      const input = document.createElement('input');
      expect(UniversalContentWriter.isContentEditableTarget(input)).toBe(false);

      const div = document.createElement('div');
      expect(UniversalContentWriter.isContentEditableTarget(div)).toBe(false);
    });
  });

  describe('UniversalContentWriter.write Text Injection', () => {
    it('injects text into contenteditable with beforeinput and input event dispatching', () => {
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      document.body.appendChild(editor);

      let beforeInputFired = false;
      let inputFired = false;
      editor.addEventListener('beforeinput', (e: any) => {
        beforeInputFired = true;
        expect(e.data).toBe('Hello from Madadgar AI');
      });
      editor.addEventListener('input', (e: any) => {
        inputFired = true;
        expect(e.data).toBe('Hello from Madadgar AI');
      });

      const success = UniversalContentWriter.write(editor, 'Hello from Madadgar AI');
      expect(success).toBe(true);
      expect(editor.textContent).toContain('Hello from Madadgar AI');
      expect(beforeInputFired).toBe(true);
      expect(inputFired).toBe(true);
    });

    it('supports append and clearFirst options', () => {
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      editor.textContent = 'Existing draft header. ';
      document.body.appendChild(editor);

      UniversalContentWriter.write(editor, 'New body paragraph.', { append: true });
      expect(editor.textContent).toBe('Existing draft header. New body paragraph.');

      UniversalContentWriter.write(editor, 'Brand new message.', { clearFirst: true });
      expect(editor.textContent).toBe('Brand new message.');
    });

    it('ActionExecutor.executeType seamlessly delegates rich text to UniversalContentWriter', () => {
      const richEditor = document.createElement('div');
      richEditor.className = 'ProseMirror';
      richEditor.setAttribute('contenteditable', 'true');
      document.body.appendChild(richEditor);

      const success = ActionExecutor.executeType(richEditor, 'ProseMirror rich text test');
      expect(success).toBe(true);
      expect(richEditor.textContent).toContain('ProseMirror rich text test');
    });
  });
});
