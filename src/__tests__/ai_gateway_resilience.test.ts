import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AIGateway,
  RateLimitCooldownError,
  type FailoverEvent,
  type RateLimitStatus,
} from '@/ai/ai_gateway';
import { GeminiApiError } from '@/ai/gemini_client';
import { GroqApiError } from '@/ai/groq_client';
import { saveSettings, clearAllStorage } from '@/common/storage_adapter';

describe('Free-Tier Resilience & Fallback Engine (Task 2.5)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearAllStorage();
    AIGateway.clearRateLimitStatus();
  });

  describe('Exponential Backoff & Retry Logic', () => {
    it('retries on HTTP 429 and succeeds on a subsequent attempt', async () => {
      let callCount = 0;
      const sleepSpy = vi.spyOn(AIGateway, 'sleep').mockResolvedValue(undefined);

      const action = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new GeminiApiError('Quota exceeded', 429, 'Too Many Requests');
        }
        return 'success result';
      });

      const result = await AIGateway.executeWithRetry(action, {
        maxRetries: 2,
        initialDelayMs: 1500,
        backoffFactor: 2,
      });

      expect(result).toBe('success result');
      expect(action).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalledWith(1500, undefined);
    });

    it('retries on HTTP 503 with exponential delay', async () => {
      let callCount = 0;
      const sleepSpy = vi.spyOn(AIGateway, 'sleep').mockResolvedValue(undefined);

      const action = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new GeminiApiError('Service unavailable', 503, 'Service Unavailable');
        }
        if (callCount === 2) {
          throw new GeminiApiError('Service unavailable', 503, 'Service Unavailable');
        }
        return 'eventual success';
      });

      const result = await AIGateway.executeWithRetry(action, {
        maxRetries: 2,
        initialDelayMs: 1500,
        backoffFactor: 2,
      });

      expect(result).toBe('eventual success');
      expect(action).toHaveBeenCalledTimes(3);
      // Attempt 1: 1500ms
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 1500, undefined);
      // Attempt 2: 1500 * 2 = 3000ms
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 3000, undefined);
    });

    it('does not retry on non-retryable errors (e.g. HTTP 400 Bad Request)', async () => {
      const action = vi.fn().mockRejectedValueOnce(
        new GeminiApiError('Invalid parameter', 400, 'Bad Request')
      );

      await expect(
        AIGateway.executeWithRetry(action, { maxRetries: 2 })
      ).rejects.toThrow('Invalid parameter');

      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  describe('Seamless Failover from Gemini to Groq (llama-3.3-70b-versatile)', () => {
    it('seamlessly redirects text tasks to Groq when Gemini returns 429 and Groq key is configured', async () => {
      await saveSettings({
        geminiApiKey: 'test-gemini-key',
        groqApiKey: 'gsk_test_groq_key',
        defaultLanguage: 'en',
      });

      vi.spyOn(AIGateway, 'sleep').mockResolvedValue(undefined);

      const failoverEvents: FailoverEvent[] = [];
      const unsub = AIGateway.subscribeFailover((event) => {
        failoverEvents.push(event);
      });

      // Gemini always throws 429
      const geminiAction = vi.fn().mockRejectedValue(
        new GeminiApiError('Rate limit exceeded', 429, 'Too Many Requests')
      );

      // Groq succeeds
      const groqAction = vi.fn().mockResolvedValue('Response from Groq Llama 3.3');

      const result = await AIGateway.executeWithResilience({
        taskName: 'summarizeArticle',
        geminiAction,
        groqAction,
      });

      expect(result).toBe('Response from Groq Llama 3.3');
      expect(geminiAction).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(groqAction).toHaveBeenCalledTimes(1);

      // Failover event was emitted
      expect(failoverEvents).toHaveLength(1);
      expect(failoverEvents[0].from).toBe('gemini');
      expect(failoverEvents[0].to).toBe('groq');
      expect(failoverEvents[0].model).toBe('llama-3.3-70b-versatile');
      expect(failoverEvents[0].reason).toBe('RATE_LIMIT_429');

      unsub();
    });

    it('sets rate-limit cooldown when both Gemini and Groq fail with 429', async () => {
      await saveSettings({
        geminiApiKey: 'test-gemini-key',
        groqApiKey: 'gsk_test_groq_key',
        defaultLanguage: 'en',
      });

      vi.spyOn(AIGateway, 'sleep').mockResolvedValue(undefined);

      const geminiAction = vi.fn().mockRejectedValue(
        new GeminiApiError('Gemini 429', 429, 'Too Many Requests')
      );
      const groqAction = vi.fn().mockRejectedValue(
        new GroqApiError('Groq 429', 429, 'Too Many Requests')
      );

      await expect(
        AIGateway.executeWithResilience({
          taskName: 'groundedChatStream',
          geminiAction,
          groqAction,
        })
      ).rejects.toThrowError(RateLimitCooldownError);

      const status = AIGateway.getRateLimitStatus();
      expect(status).not.toBeNull();
      expect(status?.isActive).toBe(true);
      expect(status?.cooldownSeconds).toBe(60);
      expect(status?.providers).toEqual(['gemini', 'groq']);
    });

    it('sets rate-limit cooldown and throws RateLimitCooldownError if Gemini is 429 and no Groq key configured', async () => {
      await saveSettings({
        geminiApiKey: 'test-gemini-key',
        groqApiKey: '',
        defaultLanguage: 'en',
      });

      vi.spyOn(AIGateway, 'sleep').mockResolvedValue(undefined);

      const geminiAction = vi.fn().mockRejectedValue(
        new GeminiApiError('Gemini 429', 429, 'Too Many Requests')
      );

      await expect(
        AIGateway.executeWithResilience({
          taskName: 'summarizeArticle',
          geminiAction,
        })
      ).rejects.toThrowError(RateLimitCooldownError);

      const status = AIGateway.getRateLimitStatus();
      expect(status?.isActive).toBe(true);
      expect(status?.providers).toEqual(['gemini']);
    });
  });

  describe('Visual Inspection Resilience', () => {
    it('retries visual inspection on 503 but does not attempt Groq failover', async () => {
      await saveSettings({
        geminiApiKey: 'test-gemini-key',
        groqApiKey: 'gsk_test_groq_key',
        defaultLanguage: 'en',
      });

      vi.spyOn(AIGateway, 'sleep').mockResolvedValue(undefined);

      let callCount = 0;
      const geminiAction = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new GeminiApiError('Overloaded', 503, 'Service Unavailable');
        }
        return 'Vision analysis complete';
      });

      const result = await AIGateway.executeWithResilience({
        taskName: 'inspectVisualStream',
        geminiAction,
        groqAction: undefined, // Vision does not route to text models
      });

      expect(result).toBe('Vision analysis complete');
      expect(geminiAction).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rate Limit Cooldown Subscriptions', () => {
    it('notifies subscribers when cooldown is set and cleared', () => {
      const statuses: (RateLimitStatus | null)[] = [];
      const unsub = AIGateway.subscribeRateLimit((s) => {
        statuses.push(s);
      });

      AIGateway.setRateLimitCooldown(45, ['gemini'], 'Test cooldown');
      expect(AIGateway.getRateLimitStatus()?.cooldownSeconds).toBe(45);

      AIGateway.clearRateLimitStatus();
      expect(AIGateway.getRateLimitStatus()).toBeNull();

      unsub();
    });
  });
});

