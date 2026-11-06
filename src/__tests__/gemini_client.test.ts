import { describe, it, expect, vi } from 'vitest';
import {
  generateContent,
  streamGenerateContent,
  GeminiApiError,
} from '@/ai/gemini_client';

describe('Gemini Client', () => {
  it('calls generateContent and extracts candidate text', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Generated summary result' }],
            },
          },
        ],
      }),
    } as Response);

    const result = await generateContent({
      apiKey: 'test-api-key',
      prompt: 'Summarize this page',
      systemInstruction: 'Be concise',
    });

    expect(result).toBe('Generated summary result');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toContain('models/gemini-2.5-flash-lite:generateContent?key=test-api-key');
    const parsedBody = JSON.parse(calledInit?.body as string);
    expect(parsedBody.contents[0].parts[0].text).toBe('Summarize this page');
    expect(parsedBody.systemInstruction.parts[0].text).toBe('Be concise');

    fetchSpy.mockRestore();
  });

  it('handles streaming Server-Sent Events (alt=sse) and calls onChunk', async () => {
    const sseChunks = [
      'data: {"candidates": [{"content": {"parts": [{"text": "Hello "}]}}]}\n\n',
      'data: {"candidates": [{"content": {"parts": [{"text": "world!"}]}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const encoder = new TextEncoder();
    let chunkIndex = 0;

    const mockStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < sseChunks.length) {
          controller.enqueue(encoder.encode(sseChunks[chunkIndex]));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    } as unknown as Response);

    const receivedChunks: string[] = [];
    const result = await streamGenerateContent({
      apiKey: 'test-api-key',
      prompt: 'Stream test',
      onChunk: (chunk) => {
        receivedChunks.push(chunk);
      },
    });

    expect(result).toBe('Hello world!');
    expect(receivedChunks).toEqual(['Hello ', 'world!']);

    fetchSpy.mockRestore();
  });

  it('throws typed GeminiApiError on HTTP error status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({
        error: { message: 'Resource has been exhausted (e.g. check quota).' },
      }),
    } as Response);

    await expect(
      generateContent({
        apiKey: 'test-api-key',
        prompt: 'Rate limited prompt',
      })
    ).rejects.toThrow(GeminiApiError);

    fetchSpy.mockRestore();
  });
});

