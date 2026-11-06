// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionExecutor } from '@/content/executor';
import { DOMScanner } from '@/content/scanner';
import { BadgeOverlay } from '@/content/overlay';

describe('Safe Synthetic Event Action Executor (Task 3.5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    DOMScanner.clear();
    BadgeOverlay.destroy();
  });

  describe('executeClick', () => {
    it('dispatches mousedown, mouseup, and click events to target element', async () => {
      const button = document.createElement('button');
      button.textContent = 'Submit Order';
      document.body.appendChild(button);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      let clickFired = false;
      let mousedownFired = false;
      let mouseupFired = false;

      button.addEventListener('click', () => { clickFired = true; });
      button.addEventListener('mousedown', () => { mousedownFired = true; });
      button.addEventListener('mouseup', () => { mouseupFired = true; });

      const result = await ActionExecutor.execute({
        action: 'click',
        target_id: targetId,
        reason: 'Clicking submit order button',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('click');
      expect(result.targetId).toBe(targetId);
      expect(clickFired).toBe(true);
      expect(mousedownFired).toBe(true);
      expect(mouseupFired).toBe(true);
    });

    it('rejects click execution on disabled element', async () => {
      const disabledBtn = document.createElement('button');
      disabledBtn.disabled = true;
      disabledBtn.textContent = 'Disabled Action';
      document.body.appendChild(disabledBtn);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      const result = await ActionExecutor.execute({
        action: 'click',
        target_id: targetId,
        reason: 'Trying to click disabled button',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });

  describe('executeType', () => {
    it('types text into input and dispatches input and change events', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      let inputFired = false;
      let changeFired = false;

      input.addEventListener('input', () => { inputFired = true; });
      input.addEventListener('change', () => { changeFired = true; });

      const result = await ActionExecutor.execute({
        action: 'type',
        target_id: targetId,
        value: 'Jane Doe',
        reason: 'Filling in full name',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('type');
      expect(input.value).toBe('Jane Doe');
      expect(inputFired).toBe(true);
      expect(changeFired).toBe(true);
    });

    it('types into textarea elements properly', async () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      const result = await ActionExecutor.execute({
        action: 'type',
        target_id: targetId,
        value: 'Cover letter body text',
        reason: 'Entering cover letter',
      });

      expect(result.success).toBe(true);
      expect(textarea.value).toBe('Cover letter body text');
    });

    it('rejects typing into read-only inputs', async () => {
      const readOnlyInput = document.createElement('input');
      readOnlyInput.readOnly = true;
      readOnlyInput.value = 'fixed';
      document.body.appendChild(readOnlyInput);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      const result = await ActionExecutor.execute({
        action: 'type',
        target_id: targetId,
        value: 'new value',
        reason: 'Attempting to overwrite readonly field',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
    });
  });

  describe('executeSelect', () => {
    it('selects dropdown option by matching value or label text', async () => {
      const select = document.createElement('select');
      select.innerHTML = `
        <option value="">Select country...</option>
        <option value="us">United States</option>
        <option value="in">India</option>
        <option value="uk">United Kingdom</option>
      `;
      document.body.appendChild(select);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      let changeFired = false;
      select.addEventListener('change', () => { changeFired = true; });

      const result = await ActionExecutor.execute({
        action: 'select',
        target_id: targetId,
        value: 'India',
        reason: 'Selecting user country',
      });

      expect(result.success).toBe(true);
      expect(select.value).toBe('in');
      expect(changeFired).toBe(true);
    });

    it('fails when dropdown option is not found', async () => {
      const select = document.createElement('select');
      select.innerHTML = '<option value="a">Alpha</option>';
      document.body.appendChild(select);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      const result = await ActionExecutor.execute({
        action: 'select',
        target_id: targetId,
        value: 'NonExistingOption',
        reason: 'Selecting invalid option',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('was not found');
    });
  });

  describe('executeScroll', () => {
    it('scrolls page in vertical directions', async () => {
      const resultDown = await ActionExecutor.execute({
        action: 'scroll',
        value: 'down',
        reason: 'Scroll down to load more content',
      });
      expect(resultDown.success).toBe(true);

      const resultUp = await ActionExecutor.execute({
        action: 'scroll',
        value: 'up',
        reason: 'Scroll back up',
      });
      expect(resultUp.success).toBe(true);
    });
  });

  describe('done, fail, and dryRun modes', () => {
    it('handles done terminal action successfully', async () => {
      const result = await ActionExecutor.execute({
        action: 'done',
        reason: 'All errand tasks completed',
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe('done');
    });

    it('handles fail action with specified reason', async () => {
      const result = await ActionExecutor.execute({
        action: 'fail',
        reason: 'Encountered unexpected anti-bot verification',
      });
      expect(result.success).toBe(false);
      expect(result.action).toBe('fail');
      expect(result.error).toContain('anti-bot verification');
    });

    it('honors dryRun mode by highlighting without mutating values', async () => {
      const input = document.createElement('input');
      input.value = 'Initial';
      document.body.appendChild(input);

      const elements = DOMScanner.scan(document);
      const targetId = elements[0].id;

      const result = await ActionExecutor.execute(
        {
          action: 'type',
          target_id: targetId,
          value: 'Changed Value',
          reason: 'Testing dry run mode',
        },
        true // dryRun
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      // Value should remain untouched in dry run
      expect(input.value).toBe('Initial');
    });
  });
});

