import { describe, it, expect } from 'vitest';
import {
  serializeElement,
  serializeActionMap,
  estimateTokens,
  compressActionMapToBudget,
} from '@/ai/token_optimizer';
import type { ScannedElement } from '@/common/types';

describe('Token Optimizer (Task 3.3)', () => {
  const dummyRect = {
    top: 100,
    left: 50,
    width: 200,
    height: 40,
    bottom: 140,
    right: 250,
  };

  describe('serializeElement', () => {
    it('serializes text input with label and value', () => {
      const el: ScannedElement = {
        id: 1,
        tag: 'input',
        type: 'text',
        label: 'Full Name',
        currentValue: 'Jane Doe',
        rect: dummyRect,
      };

      const result = serializeElement(el);
      expect(result).toBe('#1 [input:text] "Full Name" (value: "Jane Doe")');
    });

    it('serializes email input using placeholder when label is absent', () => {
      const el: ScannedElement = {
        id: 2,
        tag: 'input',
        type: 'email',
        placeholder: 'you@domain.com',
        currentValue: '',
        rect: dummyRect,
      };

      const result = serializeElement(el);
      expect(result).toBe('#2 [input:email] "you@domain.com" (value: "")');
    });

    it('masks password values for privacy', () => {
      const el: ScannedElement = {
        id: 3,
        tag: 'input',
        type: 'password',
        label: 'Account Password',
        isPassword: true,
        currentValue: 'SuperSecret123!',
        rect: dummyRect,
      };

      const result = serializeElement(el);
      expect(result).toBe('#3 [input:password] "Account Password" (value: "••••••••")');
      expect(result).not.toContain('SuperSecret123!');
    });

    it('serializes checkbox state', () => {
      const checkedBox: ScannedElement = {
        id: 4,
        tag: 'input',
        type: 'checkbox',
        label: 'Accept Terms & Conditions',
        currentValue: 'true',
        rect: dummyRect,
      };

      expect(serializeElement(checkedBox)).toBe(
        '#4 [input:checkbox] "Accept Terms & Conditions" (checked: true)'
      );

      const uncheckedBox: ScannedElement = {
        id: 5,
        tag: 'input',
        type: 'checkbox',
        label: 'Receive newsletter',
        currentValue: 'false',
        rect: dummyRect,
      };

      expect(serializeElement(uncheckedBox)).toBe(
        '#5 [input:checkbox] "Receive newsletter" (checked: false)'
      );
    });

    it('serializes standard buttons and flags consequential buttons', () => {
      const standardBtn: ScannedElement = {
        id: 6,
        tag: 'button',
        text: 'Save Draft',
        rect: dummyRect,
      };
      expect(serializeElement(standardBtn)).toBe('#6 [button] "Save Draft"');

      const consequentialBtn: ScannedElement = {
        id: 7,
        tag: 'button',
        text: 'Confirm Payment & Place Order',
        isConsequential: true,
        rect: dummyRect,
      };
      expect(serializeElement(consequentialBtn)).toBe(
        '#7 [button] "Confirm Payment & Place Order" [CONSEQUENTIAL]'
      );
    });

    it('serializes links with truncated href', () => {
      const link: ScannedElement = {
        id: 8,
        tag: 'a',
        text: 'Pricing & Plans',
        href: 'https://example.com/pricing',
        rect: dummyRect,
      };
      expect(serializeElement(link)).toBe('#8 [a] "Pricing & Plans" (href: "/pricing")');
    });

    it('serializes select dropdown with selected option', () => {
      const selectEl: ScannedElement = {
        id: 9,
        tag: 'select',
        label: 'Country of Residence',
        currentValue: 'United States',
        rect: dummyRect,
      };
      expect(serializeElement(selectEl)).toBe('#9 [select] "Country of Residence" (value: "United States")');
    });

    it('flags disabled elements', () => {
      const disabledBtn: ScannedElement = {
        id: 10,
        tag: 'button',
        text: 'Processing...',
        disabled: true,
        rect: dummyRect,
      };
      expect(serializeElement(disabledBtn)).toBe('#10 [button] "Processing..." [disabled]');
    });

    it('includes coordinates when requested', () => {
      const el: ScannedElement = {
        id: 11,
        tag: 'button',
        text: 'Click Me',
        rect: dummyRect,
      };
      const result = serializeElement(el, { includeCoordinates: true });
      expect(result).toBe('#11 [button] "Click Me" {x:50,y:100,w:200,h:40}');
    });
  });

  describe('serializeActionMap', () => {
    it('returns empty notice for empty element lists', () => {
      const result = serializeActionMap([]);
      expect(result).toBe('(No interactive elements detected)');
    });

    it('formats multiple elements with a clean header', () => {
      const elements: ScannedElement[] = [
        { id: 1, tag: 'input', type: 'text', label: 'Search', rect: dummyRect },
        { id: 2, tag: 'button', text: 'Search', rect: dummyRect },
      ];

      const serialized = serializeActionMap(elements);
      expect(serialized).toContain('=== Interactive Page Elements (Total: 2) ===');
      expect(serialized).toContain('#1 [input:text] "Search"');
      expect(serialized).toContain('#2 [button] "Search"');
    });
  });

  describe('estimateTokens & compressActionMapToBudget', () => {
    it('estimates tokens proportionally to character length', () => {
      const shortText = 'Hello world';
      expect(estimateTokens(shortText)).toBeGreaterThan(0);
      expect(estimateTokens(shortText)).toBeLessThan(10);
    });

    it('compresses action map within token budget preserving element count reduction', () => {
      const elements: ScannedElement[] = [];
      // Generate 150 elements with long descriptions
      for (let i = 1; i <= 150; i++) {
        elements.push({
          id: i,
          tag: i % 2 === 0 ? 'a' : 'input',
          type: i % 2 === 0 ? undefined : 'text',
          label: `Element Number Long Label Description With Lots Of Words To Fill Characters ${i}`,
          isConsequential: i === 150,
          rect: dummyRect,
        });
      }

      const result = compressActionMapToBudget(elements, 300);
      expect(result.elementCount).toBeLessThan(elements.length);
      expect(result.elementCount).toBeGreaterThan(0);
      expect(result.estimatedTokens).toBeLessThanOrEqual(500);
      expect(result.serialized).toContain('=== Interactive Page Elements');
    });
  });
});
