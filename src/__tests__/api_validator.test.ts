import { describe, it, expect, vi } from 'vitest';
import { validateGeminiApiKey, validateGroqApiKey } from '@/common/api_validator';

describe('API Key Validator', () => {
  it('rejects empty or whitespace keys immediately without network call', async () => {
    const geminiRes = await validateGeminiApiKey('   ');
    expect(geminiRes.valid).toBe(false);
    expect(geminiRes.error).toContain('cannot be empty');

    const groqRes = await validateGroqApiKey('');
    expect(groqRes.valid).toBe(false);
    expect(groqRes.error).toContain('cannot be empty');
  });

  it('validates a successful response correctly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-2.5-flash-lite' }] }),
    } as Response);

    const result = await validateGeminiApiKey('valid-fake-key');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();

    fetchSpy.mockRestore();
  });

  it('handles API error responses gracefully', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({
        error: { message: 'API key not valid. Please pass a valid API key.' },
      }),
    } as Response);

    const result = await validateGeminiApiKey('invalid-fake-key');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('API key not valid. Please pass a valid API key.');

    fetchSpy.mockRestore();
  });
});

