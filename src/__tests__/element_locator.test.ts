// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildElementLocatorPrompt,
  parseElementLocatorResponse,
} from '@/ai/prompts/element_locator';
import { AIGateway } from '@/ai/ai_gateway';
import type { ScannedElement } from '@/common/types';

vi.mock('@/ai/gemini_client', () => ({
  generateContent: vi.fn(),
  streamGenerateContent: vi.fn(),
}));

vi.mock('@/ai/groq_client', () => ({
  generateGroqContent: vi.fn(),
  streamGenerateGroqContent: vi.fn(),
}));

describe('Element Locator (Task 3.4)', () => {
  const dummyRect = {
    top: 50,
    left: 100,
    width: 150,
    height: 35,
    bottom: 85,
    right: 250,
  };

  describe('buildElementLocatorPrompt', () => {
    it('generates prompt with strict JSON schema instructions and English guidance', () => {
      const actionMap = '#1 [button] "Sign In"\n#2 [input:file] "Upload Resume"';
      const { systemInstruction, userPrompt } = buildElementLocatorPrompt(
        'Where do I upload my resume?',
        actionMap,
        'en'
      );

      expect(userPrompt).toContain('Where do I upload my resume?');
      expect(userPrompt).toContain('#2 [input:file] "Upload Resume"');
      expect(systemInstruction).toContain('"target_id"');
      expect(systemInstruction).toContain('"reason"');
      expect(systemInstruction).toContain('"confidence"');
      expect(systemInstruction).toContain('JSON');
    });

    it('includes Hinglish instructions when requested', () => {
      const actionMap = '#1 [button] "Pay Now"';
      const { systemInstruction, userPrompt } = buildElementLocatorPrompt(
        'Payment kahan karna hai?',
        actionMap,
        'hinglish'
      );

      expect(userPrompt).toContain('Payment kahan karna hai?');
      expect(systemInstruction).toContain('Hinglish');
    });
  });

  describe('parseElementLocatorResponse', () => {
    it('parses valid JSON response correctly', () => {
      const raw = JSON.stringify({
        target_id: 4,
        reason: 'The file input element with label "Upload Resume"',
        confidence: 'high',
      });

      const parsed = parseElementLocatorResponse(raw);
      expect(parsed.targetId).toBe(4);
      expect(parsed.reason).toBe('The file input element with label "Upload Resume"');
      expect(parsed.confidence).toBe('high');
    });

    it('parses JSON enclosed in markdown code fences', () => {
      const markdown = `Here is the identified target element:
\`\`\`json
{
  "target_id": 8,
  "reason": "The 'Pricing & Plans' navigation link",
  "confidence": "medium"
}
\`\`\`
Hope this helps!`;

      const parsed = parseElementLocatorResponse(markdown);
      expect(parsed.targetId).toBe(8);
      expect(parsed.reason).toBe("The 'Pricing & Plans' navigation link");
      expect(parsed.confidence).toBe('medium');
    });

    it('handles target_id: null when no matching element exists', () => {
      const raw = JSON.stringify({
        target_id: null,
        reason: 'No pricing table or plan links detected on this login page.',
        confidence: 'low',
      });

      const parsed = parseElementLocatorResponse(raw);
      expect(parsed.targetId).toBeNull();
      expect(parsed.reason).toContain('No pricing table');
      expect(parsed.confidence).toBe('low');
    });

    it('handles targetId camelCase format if returned by model', () => {
      const raw = JSON.stringify({
        targetId: 15,
        reason: 'Submit button',
        confidence: 'high',
      });

      const parsed = parseElementLocatorResponse(raw);
      expect(parsed.targetId).toBe(15);
      expect(parsed.confidence).toBe('high');
    });

    it('gracefully recovers from non-JSON unparseable output', () => {
      const invalid = 'I could not find anything matching your request at all.';
      const parsed = parseElementLocatorResponse(invalid);

      expect(parsed.targetId).toBeNull();
      expect(parsed.confidence).toBe('low');
      expect(parsed.reason).toBeTruthy();
    });
  });

  describe('AIGateway.locateElement', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      localStorage.clear();
      localStorage.setItem(
        'madadgar_settings',
        JSON.stringify({
          geminiApiKey: 'test-gemini-key',
          defaultLanguage: 'en',
        })
      );
    });

    it('locates target element through AIGateway resilience flow', async () => {
      const { generateContent } = await import('@/ai/gemini_client');
      vi.mocked(generateContent).mockResolvedValueOnce(
        JSON.stringify({
          target_id: 3,
          reason: 'This is the primary login button',
          confidence: 'high',
        })
      );

      const elements: ScannedElement[] = [
        { id: 1, tag: 'input', type: 'text', label: 'Username', rect: dummyRect },
        { id: 2, tag: 'input', type: 'password', label: 'Password', isPassword: true, rect: dummyRect },
        { id: 3, tag: 'button', text: 'Sign In', rect: dummyRect },
      ];

      const result = await AIGateway.locateElement('Where is the login button?', elements);

      expect(result.targetId).toBe(3);
      expect(result.reason).toContain('primary login button');
      expect(result.confidence).toBe('high');
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it('returns null targetId when elements list is empty without invoking LLM', async () => {
      const { generateContent } = await import('@/ai/gemini_client');

      const result = await AIGateway.locateElement('Find button', []);
      expect(result.targetId).toBeNull();
      expect(result.reason).toContain('No interactive elements');
      expect(generateContent).not.toHaveBeenCalled();
    });
  });
});

