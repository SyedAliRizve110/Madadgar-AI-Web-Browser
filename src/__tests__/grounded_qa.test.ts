import { describe, it, expect, vi } from 'vitest';
import {
  buildGroundedSystemInstruction,
  buildGroundedChatContents,
} from '../ai/prompts/grounded_qa';
import type { PageContext, ChatMessage } from '../common/types';
import { AIGateway } from '../ai/ai_gateway';

describe('Grounded Page QA Engine (Task 2.2)', () => {
  const mockContext: PageContext = {
    tabId: 101,
    title: 'Quantum Computing Breakthroughs',
    url: 'https://science.org/quantum',
    byline: 'Prof. Richard Feynman',
    textContent:
      'Researchers have demonstrated topological qubits with 99.9% error suppression under cryogenic conditions.',
    length: 105,
    isYouTube: false,
  };

  describe('Grounded System Instructions', () => {
    it('enforces strict grounding rule and missing information refusal statement', () => {
      const instruction = buildGroundedSystemInstruction(mockContext, 'en');

      expect(instruction).toContain(
        'Answer questions STRICTLY and EXCLUSIVELY based on the provided page context.'
      );
      expect(instruction).toContain(
        'This information is not present on the current page.'
      );
      expect(instruction).toContain('Do NOT invent external facts');
      expect(instruction).toContain('Page Title: "Quantum Computing Breakthroughs"');
      expect(instruction).toContain('Page URL: https://science.org/quantum');
      expect(instruction).toContain('topological qubits with 99.9% error suppression');
    });

    it('generates conversational Hinglish grounding instructions', () => {
      const instruction = buildGroundedSystemInstruction(mockContext, 'hinglish');

      expect(instruction).toContain(
        'Aapko diye gaye webpage context ke aadhar par hi sawaal ka jawaab dena hai.'
      );
      expect(instruction).toContain(
        'This information is not present on the current page.'
      );
      expect(instruction).toContain('Conversational, colloquial Hinglish me baat karein');
      expect(instruction).toContain('topological qubits');
    });

    it('incorporates active text selection if user highlighted a section', () => {
      const contextWithSelection: PageContext = {
        ...mockContext,
        selection: 'cryogenic conditions',
      };

      const instruction = buildGroundedSystemInstruction(contextWithSelection, 'en');
      expect(instruction).toContain('Currently Selected Text: "cryogenic conditions"');
      expect(instruction).toContain(
        'If a user highlighted or selected specific text on the page, prioritize answering in relation to that selected excerpt.'
      );
    });
  });

  describe('Chat Contents & History Builder', () => {
    it('builds multi-turn GeminiContent array preserving user and model roles', () => {
      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is the error rate mentioned?',
          timestamp: 1000,
        },
        {
          id: '2',
          role: 'assistant',
          content: 'The page mentions 99.9% error suppression.',
          timestamp: 2000,
        },
      ];

      const contents = buildGroundedChatContents(
        'Can this operate at room temperature?',
        history,
        mockContext
      );

      expect(contents).toHaveLength(3);
      expect(contents[0].role).toBe('user');
      expect(contents[0].parts[0].text).toBe('What is the error rate mentioned?');
      expect(contents[1].role).toBe('model');
      expect(contents[1].parts[0].text).toBe('The page mentions 99.9% error suppression.');
      expect(contents[2].role).toBe('user');
      expect(contents[2].parts[0].text).toBe('Can this operate at room temperature?');
    });

    it('augments prompt when user asks about selected text', () => {
      const contextWithSelection: PageContext = {
        ...mockContext,
        selection: '99.9% error suppression',
      };

      const contents = buildGroundedChatContents(
        'Explain this in detail',
        [],
        contextWithSelection
      );

      expect(contents[0].parts[0].text).toContain(
        '[Context regarding selected text: "99.9% error suppression"]'
      );
      expect(contents[0].parts[0].text).toContain('Explain this in detail');
    });
  });

  describe('AIGateway Grounded Chat Stream', () => {
    it('invokes streaming chat with system instructions and pipes chunks', async () => {
      const mockStreamResponse =
        'data: {"candidates": [{"content": {"parts": [{"text": "Based on "}]}}]}\n\n' +
        'data: {"candidates": [{"content": {"parts": [{"text": "the page, "}]}}]}\n\n' +
        'data: {"candidates": [{"content": {"parts": [{"text": "topological qubits were used."}]}}]}\n\n';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => {
            let done = false;
            return {
              read: async () => {
                if (!done) {
                  done = true;
                  return {
                    done: false,
                    value: new TextEncoder().encode(mockStreamResponse),
                  };
                }
                return { done: true, value: undefined };
              },
            };
          },
        },
      });

      global.fetch = mockFetch;

      const chunks: string[] = [];
      const result = await AIGateway.groundedChatStream({
        query: 'What kind of qubits are used?',
        context: mockContext,
        apiKey: 'test-api-key',
        language: 'en',
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
      });

      expect(result).toBe('Based on the page, topological qubits were used.');
      expect(chunks.length).toBeGreaterThan(0);

      // Verify the POST request sent the grounded system instruction
      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.systemInstruction.parts[0].text).toContain(
        'Answer questions STRICTLY and EXCLUSIVELY based on the provided page context.'
      );
      expect(calledBody.contents[0].parts[0].text).toBe('What kind of qubits are used?');
    });
  });
});
