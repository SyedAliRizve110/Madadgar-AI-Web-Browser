import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateGroqContent,
  streamGenerateGroqContent,
  formatGeminiPromptToGroqMessages,
  GroqApiError,
} from '@/ai/groq_client';
import { DEFAULT_GROQ_MODEL, GROQ_API_BASE_URL } from '@/common/constants';

describe('Groq Client (Task 2.5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatGeminiPromptToGroqMessages', () => {
    it('converts simple string prompt and system instruction to Groq messages', () => {
      const messages = formatGeminiPromptToGroqMessages(
        'What is quantum computing?',
        'You are a physics expert.'
      );

      expect(messages).toEqual([
        { role: 'system', content: 'You are a physics expert.' },
        { role: 'user', content: 'What is quantum computing?' },
      ]);
    });

    it('converts GeminiContent array to Groq user and assistant messages', () => {
      const geminiContents = [
        { role: 'user' as const, parts: [{ text: 'Hello' }] },
        { role: 'model' as const, parts: [{ text: 'Hi! How can I help?' }] },
        { role: 'user' as const, parts: [{ text: 'Explain photosynthesis.' }] },
      ];

      const messages = formatGeminiPromptToGroqMessages(
        geminiContents,
        'Be concise.'
      );

      expect(messages).toEqual([
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi! How can I help?' },
        { role: 'user', content: 'Explain photosynthesis.' },
      ]);
    });
  });

  describe('generateGroqContent (Non-streaming)', () => {
    it('sends correct headers, model, and payload to Groq chat completions', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Groq response content',
              },
            },
          ],
        }),
      } as Response);

      const result = await generateGroqContent({
        apiKey: 'gsk_test_key_123',
        messages: [{ role: 'user', content: 'Test question' }],
      });

      expect(result).toBe('Groq response content');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${GROQ_API_BASE_URL}/chat/completions`);
      expect((options?.headers as any)['Authorization']).toBe('Bearer gsk_test_key_123');

      const body = JSON.parse(options?.body as string);
      expect(body.model).toBe(DEFAULT_GROQ_MODEL);
      expect(body.stream).toBe(false);
      expect(body.messages).toHaveLength(1);
    });

    it('throws GroqApiError with isRateLimited=true on HTTP 429', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: {
            message: 'Rate limit reached for model llama-3.3-70b-versatile',
            type: 'tokens',
          },
        }),
      } as Response);

      await expect(
        generateGroqContent({
          apiKey: 'gsk_test_key',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrowError(GroqApiError);

      try {
        await generateGroqContent({
          apiKey: 'gsk_test_key',
          messages: [{ role: 'user', content: 'Hello' }],
        });
      } catch (err) {
        if (err instanceof GroqApiError) {
          expect(err.status).toBe(429);
          expect(err.isRateLimited).toBe(true);
        }
      }
    });
  });

  describe('streamGenerateGroqContent (SSE Streaming)', () => {
    it('parses Server-Sent Events stream and accumulates tokens', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" from Groq!"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const encoder = new TextEncoder();
      let chunkIdx = 0;

      const mockStream = new ReadableStream({
        pull(controller) {
          if (chunkIdx < sseChunks.length) {
            controller.enqueue(encoder.encode(sseChunks[chunkIdx++]));
          } else {
            controller.close();
          }
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      } as unknown as Response);

      const chunksReceived: string[] = [];
      const result = await streamGenerateGroqContent({
        apiKey: 'gsk_test_key',
        messages: [{ role: 'user', content: 'Test stream' }],
        onChunk: (chunk) => chunksReceived.push(chunk),
      });

      expect(result).toBe('Hello world from Groq!');
      expect(chunksReceived).toEqual(['Hello', ' world', ' from Groq!']);
    });
  });
});

