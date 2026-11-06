import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIGateway } from '@/ai/ai_gateway';
import { saveSettings, clearAllStorage } from '@/common/storage_adapter';

describe('AI Gateway', () => {
  beforeEach(async () => {
    await clearAllStorage();
  });

  it('throws helpful error if no API key is configured', async () => {
    await clearAllStorage();

    await expect(
      AIGateway.summarizeArticle('Some text to summarize', { apiKey: '' })
    ).rejects.toThrow('Gemini API key is not configured');
  });

  it('summarizes article using credentials from storage and parses sections', async () => {
    await saveSettings({
      geminiApiKey: 'test-gateway-key',
      defaultLanguage: 'en',
    });

    const mockSummaryMarkdown = `
### 📌 TL;DR
AI Gateway centralizes LLM calls with type safety.

### 💡 5 Key Takeaways
1. Direct REST removes package bloat.
2. Unified interface makes UI components clean.
3. Language toggle handles prompt switching.
4. Streaming uses SSE for responsive rendering.
5. Error typing allows graceful retries.

### 🚀 Actionable Next Steps
- Integrate with SummaryCard.
- Test with real articles.
`;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: mockSummaryMarkdown }] } }],
      }),
    } as Response);

    const summary = await AIGateway.summarizeArticle('Sample article text');

    expect(summary.tldr).toBe('AI Gateway centralizes LLM calls with type safety.');
    expect(summary.keyTakeaways).toHaveLength(5);
    expect(summary.actionableSteps).toHaveLength(2);

    fetchSpy.mockRestore();
  });
});

