// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DOMScanner } from '@/content/scanner';
import { ActionExecutor } from '@/content/executor';
import { appendAuditLog, getAuditLogs, clearAuditLogs } from '@/common/storage_adapter';

describe('Practice Errand Fixtures & Multi-Step Validation (Task 3.9)', () => {
  let mockStorage: Record<string, any> = {};

  beforeEach(() => {
    mockStorage = {};
    DOMScanner.clear();

    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn((keys: string | string[], cb?: (res: any) => void) => {
            const key = Array.isArray(keys) ? keys[0] : keys;
            const res = { [key]: mockStorage[key] };
            if (cb) cb(res);
            return Promise.resolve(res);
          }),
          set: vi.fn((items: Record<string, any>, cb?: () => void) => {
            Object.assign(mockStorage, items);
            if (cb) cb();
            return Promise.resolve();
          }),
          remove: vi.fn((keys: string | string[], cb?: () => void) => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            keyList.forEach((k) => delete mockStorage[k]);
            if (cb) cb();
            return Promise.resolve();
          }),
        },
      },
      runtime: {
        lastError: null,
      },
    };
  });

  describe('Practice Errand 1: Multi-Step Internship Application Form', () => {
    beforeEach(async () => {
      await clearAuditLogs();
      const htmlPath = path.resolve(__dirname, '../../test/fixtures/practice_form.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      document.documentElement.innerHTML = htmlContent;
      document.querySelectorAll('script').forEach((s) => {
        if (s.textContent) {
          (window as any).eval(s.textContent);
        }
      });
    });

    it('indexes form inputs and successfully completes multi-step form errand', async () => {
      // 1. Scan interactive elements
      const elements = DOMScanner.scan(document);
      expect(elements.length).toBeGreaterThanOrEqual(8);

      const fullNameEl = elements.find((e) => e.name === 'fullName' || e.label?.includes('Full Name'));
      const emailEl = elements.find((e) => e.name === 'email' || e.label?.includes('Email'));
      const universityEl = elements.find((e) => e.name === 'university' || e.label?.includes('University'));
      const gradYearEl = elements.find((e) => e.name === 'gradYear' || e.tag === 'select');
      const submitBtn = elements.find((e) => e.text?.includes('Submit') || (e.tag === 'button' && e.type === 'submit'));

      expect(fullNameEl).toBeDefined();
      expect(emailEl).toBeDefined();
      expect(submitBtn).toBeDefined();

      const taskId = 'errand-internship-form-001';

      // Step 1: Type Full Name
      const step1Result = await ActionExecutor.execute({
        action: 'type',
        target_id: fullNameEl!.id,
        value: 'Syed Ali Rizvi',
        reason: 'Fill applicant full name',
      });
      expect(step1Result.success).toBe(true);
      expect((document.getElementById('fullName') as HTMLInputElement).value).toBe('Syed Ali Rizvi');
      await appendAuditLog({
        taskId,
        stepIndex: 1,
        actionType: 'type',
        targetBadgeId: fullNameEl!.id,
        description: `Type ("Syed Ali Rizvi") on #${fullNameEl!.id}`,
        reasoning: 'Fill applicant full name',
        userDecision: 'approved',
        value: 'Syed Ali Rizvi',
      });

      // Step 2: Type Email Address
      const step2Result = await ActionExecutor.execute({
        action: 'type',
        target_id: emailEl!.id,
        value: 'ali.rizvi@example.com',
        reason: 'Fill applicant email address',
      });
      expect(step2Result.success).toBe(true);
      expect((document.getElementById('email') as HTMLInputElement).value).toBe('ali.rizvi@example.com');
      await appendAuditLog({
        taskId,
        stepIndex: 2,
        actionType: 'type',
        targetBadgeId: emailEl!.id,
        description: `Type ("ali.rizvi@example.com") on #${emailEl!.id}`,
        reasoning: 'Fill applicant email address',
        userDecision: 'approved',
        value: 'ali.rizvi@example.com',
      });

      // Step 3: Type University
      if (universityEl) {
        const step3Result = await ActionExecutor.execute({
          action: 'type',
          target_id: universityEl.id,
          value: 'Stanford University',
          reason: 'Fill applicant university',
        });
        expect(step3Result.success).toBe(true);
        expect((document.getElementById('university') as HTMLInputElement).value).toBe('Stanford University');
      }

      // Step 4: Select Graduation Year
      if (gradYearEl) {
        const step4Result = await ActionExecutor.execute({
          action: 'select',
          target_id: gradYearEl.id,
          value: '2026',
          reason: 'Select graduation year',
        });
        expect(step4Result.success).toBe(true);
        expect((document.getElementById('gradYear') as HTMLSelectElement).value).toBe('2026');
      }

      // Step 5: Click Submit Button
      const step5Result = await ActionExecutor.execute({
        action: 'click',
        target_id: submitBtn!.id,
        reason: 'Submit completed internship application',
        is_consequential: true,
      });
      expect(step5Result.success).toBe(true);
      await appendAuditLog({
        taskId,
        stepIndex: 5,
        actionType: 'click',
        targetBadgeId: submitBtn!.id,
        description: `Click on #${submitBtn!.id}`,
        reasoning: 'Submit completed internship application',
        userDecision: 'approved',
      });

      // Verify form submission trigger
      const banner = document.getElementById('confirmation-banner');
      expect(banner?.classList.contains('active')).toBe(true);

      // Verify audit logs recorded
      const logs = await getAuditLogs();
      expect(logs.length).toBeGreaterThanOrEqual(3);
      expect(logs.every((l) => l.taskId === taskId)).toBe(true);
    });
  });

  describe('Practice Errand 2: Ecommerce Search and Cart Filter', () => {
    beforeEach(async () => {
      await clearAuditLogs();
      const htmlPath = path.resolve(__dirname, '../../test/fixtures/practice_shop.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      document.documentElement.innerHTML = htmlContent;
      document.querySelectorAll('script').forEach((s) => {
        if (s.textContent) {
          (window as any).eval(s.textContent);
        }
      });
    });

    it('searches product catalog and adds matching item to shopping cart', async () => {
      const elements = DOMScanner.scan(document);
      expect(elements.length).toBeGreaterThanOrEqual(6);

      const searchInputEl = elements.find((e) => e.placeholder?.includes('Search gadgets') || e.tag === 'input');
      const searchBtnEl = elements.find((e) => e.text === 'Search' && e.tag === 'button');
      const addCart2Btn = elements.find((e) => {
        const live = DOMScanner.getElementById(e.id);
        return live?.id === 'add-cart-2';
      });

      expect(searchInputEl).toBeDefined();
      expect(searchBtnEl).toBeDefined();
      expect(addCart2Btn).toBeDefined();

      const taskId = 'errand-shop-search-002';

      // Step 1: Type "keyboard" into search box
      const typeResult = await ActionExecutor.execute({
        action: 'type',
        target_id: searchInputEl!.id,
        value: 'keyboard',
        reason: 'Filter products by keyboard',
      });
      expect(typeResult.success).toBe(true);
      expect((document.getElementById('search-input') as HTMLInputElement).value).toBe('keyboard');
      await appendAuditLog({
        taskId,
        stepIndex: 1,
        actionType: 'type',
        targetBadgeId: searchInputEl!.id,
        description: `Type ("keyboard") on #${searchInputEl!.id}`,
        reasoning: 'Filter products by keyboard',
        userDecision: 'approved',
      });

      // Step 2: Click Search Button
      const clickSearch = await ActionExecutor.execute({
        action: 'click',
        target_id: searchBtnEl!.id,
        reason: 'Execute product search',
      });
      expect(clickSearch.success).toBe(true);
      await appendAuditLog({
        taskId,
        stepIndex: 2,
        actionType: 'click',
        targetBadgeId: searchBtnEl!.id,
        description: `Click on #${searchBtnEl!.id}`,
        reasoning: 'Execute product search',
        userDecision: 'approved',
      });

      // Verify filtered view: Keyboard is visible, Headphones are hidden
      const cardKeyboard = document.querySelector('[data-title="Mechanical RGB Gaming Keyboard"]') as HTMLElement;
      const cardHeadphones = document.querySelector('[data-title="Wireless Noise Cancelling Headphones"]') as HTMLElement;
      expect(cardKeyboard.style.display).toBe('flex');
      expect(cardHeadphones.style.display).toBe('none');

      // Step 3: Click Add to Cart
      const addToCart = await ActionExecutor.execute({
        action: 'click',
        target_id: addCart2Btn!.id,
        reason: 'Add mechanical keyboard to shopping cart',
      });
      expect(addToCart.success).toBe(true);
      await appendAuditLog({
        taskId,
        stepIndex: 3,
        actionType: 'click',
        targetBadgeId: addCart2Btn!.id,
        description: `Click on #${addCart2Btn!.id}`,
        reasoning: 'Add mechanical keyboard to shopping cart',
        userDecision: 'approved',
      });

      // Verify cart count and notification
      expect(document.getElementById('cart-count')?.textContent).toBe('1');
      const cartStatus = document.getElementById('cart-status');
      expect(cartStatus?.classList.contains('active')).toBe(true);
      expect(cartStatus?.textContent).toContain('Mechanical RGB Gaming Keyboard');

      // Verify audit logs
      const logs = await getAuditLogs();
      expect(logs.length).toBe(3);
      expect(logs[0].actionType).toBe('click');
      expect(logs[2].actionType).toBe('type');
    });
  });
});
