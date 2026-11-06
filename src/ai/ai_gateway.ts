/**
 * Madadgar AI Gateway
 * Unified façade for AI model interactions across the extension.
 * Handles credential retrieval, model selection, prompt building, streaming,
 * exponential backoff retry on HTTP 429 & 503, seamless failover to Groq
 * (llama-3.3-70b-versatile), and rate-limit cooldown management (Task 2.5).
 */

import { getSettings } from '@/common/storage_adapter';
import type { SupportedLanguage, PageContext, ChatMessage, ScannedElement, ElementLocatorResult } from '@/common/types';
import { GEMINI_VISION_MODEL, DEFAULT_GROQ_MODEL } from '@/common/constants';
import {
  generateContent,
  streamGenerateContent,
  GeminiApiError,
  type GeminiGenerationConfig,
  type GeminiContent,
} from './gemini_client';
import {
  generateGroqContent,
  streamGenerateGroqContent,
  formatGeminiPromptToGroqMessages,
  GroqApiError,
} from './groq_client';
import {
  buildArticleSummaryPrompt,
  buildYouTubeSummaryPrompt,
  parseSummary,
  type StructuredSummary,
  type SummaryPromptOptions,
} from './prompts/summarizer';
import {
  buildGroundedChatContents,
  buildChatSystemInstruction,
  type ChatMode,
} from './prompts/grounded_qa';
import { serializeActionMap, compressActionMapToBudget } from './token_optimizer';
import {
  buildElementLocatorPrompt,
  parseElementLocatorResponse,
} from './prompts/element_locator';
import {
  buildAgentPlannerPrompt,
  parseAgentActionProposal,
  buildErrorCorrectionPrompt,
} from './prompts/agent_planner';
import type {
  AgentActionProposal,
  AgentTaskStepHistory,
  UserProfileMemory,
} from '@/common/types';

export class RateLimitCooldownError extends Error {
  public cooldownSeconds: number;
  public providers: ('gemini' | 'groq')[];

  constructor(
    message: string,
    cooldownSeconds = 60,
    providers: ('gemini' | 'groq')[] = ['gemini']
  ) {
    super(message);
    this.name = 'RateLimitCooldownError';
    this.cooldownSeconds = cooldownSeconds;
    this.providers = providers;
  }
}

export interface FailoverEvent {
  from: 'gemini';
  to: 'groq';
  model: string;
  reason: 'RATE_LIMIT_429' | 'SERVICE_UNAVAILABLE_503';
  timestamp: number;
}

export interface RateLimitStatus {
  isActive: boolean;
  cooldownSeconds: number;
  expiresAt: number;
  providers: ('gemini' | 'groq')[];
  message?: string;
}

export interface BaseAIOptions {
  apiKey?: string;
  language?: SupportedLanguage;
  signal?: AbortSignal;
  config?: GeminiGenerationConfig;
}

export interface SummarizeArticleOptions extends BaseAIOptions, SummaryPromptOptions {
  onChunk?: (chunkText: string, accumulatedRaw: string) => void;
}

export interface SummarizeYouTubeOptions extends BaseAIOptions, SummaryPromptOptions {
  videoId?: string;
  hasTranscript?: boolean;
  channelTitle?: string;
  description?: string;
  onChunk?: (chunkText: string, accumulatedRaw: string) => void;
}

export interface VisualInspectionOptions extends BaseAIOptions {
  prompt: string;
  imageBase64: string; // Clean base64 without "data:image/jpeg;base64,"
  mimeType?: string; // defaults to 'image/jpeg'
  pageContext?: PageContext | null;
  onChunk?: (chunkText: string, accumulatedRaw: string) => void;
}

export interface RetryConfig {
  maxRetries?: number; // default: 2
  initialDelayMs?: number; // default: 1500 (1.5s per Task 2.5 spec)
  backoffFactor?: number; // default: 2
  retryableStatuses?: number[]; // default: [429, 503]
  signal?: AbortSignal;
}

export class AIGateway {
  private static rateLimitStatus: RateLimitStatus | null = null;
  private static rateLimitListeners: Set<(status: RateLimitStatus | null) => void> = new Set();
  private static failoverListeners: Set<(event: FailoverEvent) => void> = new Set();

  /**
   * Helper to sleep asynchronously respecting an AbortSignal
   */
  public static async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(new Error('Operation aborted'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }
    });
  }

  /**
   * Subscribes to rate-limit status updates (countdown / cooldown)
   */
  public static subscribeRateLimit(
    listener: (status: RateLimitStatus | null) => void
  ): () => void {
    this.rateLimitListeners.add(listener);
    listener(this.getRateLimitStatus());
    return () => {
      this.rateLimitListeners.delete(listener);
    };
  }

  /**
   * Subscribes to provider failover events (e.g. Gemini -> Groq)
   */
  public static subscribeFailover(
    listener: (event: FailoverEvent) => void
  ): () => void {
    this.failoverListeners.add(listener);
    return () => {
      this.failoverListeners.delete(listener);
    };
  }

  /**
   * Returns current active rate-limit status if still in cooldown
   */
  public static getRateLimitStatus(): RateLimitStatus | null {
    if (!this.rateLimitStatus) return null;
    if (Date.now() >= this.rateLimitStatus.expiresAt) {
      this.rateLimitStatus = null;
      return null;
    }
    return { ...this.rateLimitStatus };
  }

  /**
   * Explicitly sets rate limit cooldown state
   */
  public static setRateLimitCooldown(
    cooldownSeconds = 60,
    providers: ('gemini' | 'groq')[] = ['gemini'],
    message?: string
  ): RateLimitStatus {
    const status: RateLimitStatus = {
      isActive: true,
      cooldownSeconds,
      expiresAt: Date.now() + cooldownSeconds * 1000,
      providers,
      message,
    };
    this.rateLimitStatus = status;
    this.rateLimitListeners.forEach((l) => l(status));
    return status;
  }

  /**
   * Clears any active rate limit state
   */
  public static clearRateLimitStatus(): void {
    this.rateLimitStatus = null;
    this.rateLimitListeners.forEach((l) => l(null));
  }

  /**
   * Notifies subscribers of a provider failover event
   */
  private static notifyFailover(event: FailoverEvent): void {
    this.failoverListeners.forEach((l) => l(event));
  }

  /**
   * Executes an asynchronous operation with exponential backoff on HTTP 429 & 503
   * (1.5s delay, max 2 retries per Task 2.5 spec).
   */
  public static async executeWithRetry<T>(
    action: () => Promise<T>,
    config?: RetryConfig
  ): Promise<T> {
    const maxRetries = config?.maxRetries ?? 2;
    const initialDelay = config?.initialDelayMs ?? 1500;
    const backoffFactor = config?.backoffFactor ?? 2;
    const retryableStatuses = config?.retryableStatuses ?? [429, 503];

    let attempt = 0;
    while (true) {
      try {
        return await action();
      } catch (err: unknown) {
        const isGeminiRetryable =
          err instanceof GeminiApiError && retryableStatuses.includes(err.status);
        const isGroqRetryable =
          err instanceof GroqApiError && retryableStatuses.includes(err.status);

        const isRetryable = isGeminiRetryable || isGroqRetryable;

        if (!isRetryable || attempt >= maxRetries || config?.signal?.aborted) {
          throw err;
        }

        attempt++;
        const delay = initialDelay * Math.pow(backoffFactor, attempt - 1);
        const status = (err as { status?: number }).status;
        console.warn(
          `[AIGateway] Retryable HTTP ${status} encountered. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`
        );
        await this.sleep(delay, config?.signal);
      }
    }
  }

  /**
   * Resilient execution engine:
   * 1. Checks active rate-limit status.
   * 2. Attempts primary Gemini execution with exponential backoff.
   * 3. On 429/503 quota exhaustion, seamlessly redirects text tasks to Groq (llama-3.3-70b-versatile).
   * 4. If all fail, sets rate-limit cooldown without crashing the UI.
   */
  public static async executeWithResilience<T>(options: {
    taskName: string;
    geminiAction: () => Promise<T>;
    groqAction?: () => Promise<T>;
    signal?: AbortSignal;
  }): Promise<T> {
    // 1. Check if currently in cooldown
    const currentRateLimit = this.getRateLimitStatus();
    if (currentRateLimit && currentRateLimit.isActive) {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((currentRateLimit.expiresAt - Date.now()) / 1000)
      );
      if (remainingSeconds > 0) {
        throw new RateLimitCooldownError(
          `Free-tier rate limit cooldown active. Please wait ${remainingSeconds}s.`,
          remainingSeconds,
          currentRateLimit.providers
        );
      } else {
        this.clearRateLimitStatus();
      }
    }

    // 2. Attempt primary Gemini action with retry
    try {
      return await this.executeWithRetry(options.geminiAction, {
        maxRetries: 2,
        initialDelayMs: 1500,
        backoffFactor: 2,
        signal: options.signal,
      });
    } catch (geminiError: unknown) {
      const isQuotaOrServiceIssue =
        geminiError instanceof GeminiApiError &&
        (geminiError.status === 429 || geminiError.status === 503);

      // 3. Seamlessly redirect to Groq if groqAction is provided and key is present
      if (isQuotaOrServiceIssue && options.groqAction) {
        const settings = await getSettings();
        if (settings.groqApiKey && settings.groqApiKey.trim()) {
          const failoverEvent: FailoverEvent = {
            from: 'gemini',
            to: 'groq',
            model: DEFAULT_GROQ_MODEL,
            reason: geminiError.status === 429 ? 'RATE_LIMIT_429' : 'SERVICE_UNAVAILABLE_503',
            timestamp: Date.now(),
          };
          console.warn(
            `[AIGateway] Gemini quota reached (${geminiError.status}), failing over to Groq (${DEFAULT_GROQ_MODEL})...`
          );
          this.notifyFailover(failoverEvent);

          try {
            return await this.executeWithRetry(options.groqAction, {
              maxRetries: 2,
              initialDelayMs: 1500,
              backoffFactor: 2,
              signal: options.signal,
            });
          } catch (groqError: unknown) {
            console.error('[AIGateway] Groq fallback also failed:', groqError);
            this.setRateLimitCooldown(
              60,
              ['gemini', 'groq'],
              'Both Gemini and Groq rate limits were exceeded.'
            );
            throw new RateLimitCooldownError(
              'Both Gemini and Groq providers are currently rate-limited. Please wait for cooldown.',
              60,
              ['gemini', 'groq']
            );
          }
        }
      }

      // If Gemini quota reached and no fallback succeeded
      if (geminiError instanceof GeminiApiError && geminiError.status === 429) {
        this.setRateLimitCooldown(
          60,
          ['gemini'],
          'Gemini free-tier quota exhausted. Consider adding a Groq fallback key.'
        );
        throw new RateLimitCooldownError(
          'Gemini free-tier quota exhausted. Please wait for cooldown or configure Groq fallback key in Settings.',
          60,
          ['gemini']
        );
      }

      throw geminiError;
    }
  }

  /**
   * Retrieves active Gemini credentials from options or storage
   */
  private static async resolveApiKey(overrideKey?: string): Promise<string> {
    if (overrideKey !== undefined) {
      if (!overrideKey.trim()) {
        throw new Error(
          'Gemini API key is not configured. Please open Settings and enter a valid API key.'
        );
      }
      return overrideKey.trim();
    }
    const settings = await getSettings();
    if (!settings.geminiApiKey || !settings.geminiApiKey.trim()) {
      throw new Error(
        'Gemini API key is not configured. Please open Settings and enter a valid API key.'
      );
    }
    return settings.geminiApiKey.trim();
  }

  /**
   * Resolves Groq credentials from storage if configured
   */
  private static async resolveGroqApiKey(): Promise<string | undefined> {
    const settings = await getSettings();
    return settings.groqApiKey && settings.groqApiKey.trim()
      ? settings.groqApiKey.trim()
      : undefined;
  }

  /**
   * Resolves language preference from options or storage
   */
  private static async resolveLanguage(
    overrideLang?: SupportedLanguage
  ): Promise<SupportedLanguage> {
    if (overrideLang) return overrideLang;
    const settings = await getSettings();
    return settings.defaultLanguage || 'en';
  }

  /**
   * Summarizes standard article text (non-streaming)
   */
  public static async summarizeArticle(
    text: string,
    options?: SummarizeArticleOptions
  ): Promise<StructuredSummary> {
    const apiKey = await this.resolveApiKey(options?.apiKey);
    const groqKey = await this.resolveGroqApiKey();
    const language = await this.resolveLanguage(options?.language);

    const { systemInstruction, userPrompt } = buildArticleSummaryPrompt(text, {
      ...options,
      language,
    });

    const rawResponse = await this.executeWithResilience<string>({
      taskName: 'summarizeArticle',
      signal: options?.signal,
      geminiAction: () =>
        generateContent({
          apiKey,
          prompt: userPrompt,
          systemInstruction,
          config: options?.config,
          signal: options?.signal,
        }),
      groqAction: groqKey
        ? () =>
            generateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(userPrompt, systemInstruction),
              signal: options?.signal,
            })
        : undefined,
    });

    return parseSummary(rawResponse);
  }

  /**
   * Summarizes standard article text with real-time SSE streaming
   */
  public static async summarizeArticleStream(
    text: string,
    options?: SummarizeArticleOptions
  ): Promise<StructuredSummary> {
    const apiKey = await this.resolveApiKey(options?.apiKey);
    const groqKey = await this.resolveGroqApiKey();
    const language = await this.resolveLanguage(options?.language);

    const { systemInstruction, userPrompt } = buildArticleSummaryPrompt(text, {
      ...options,
      language,
    });

    const rawResponse = await this.executeWithResilience<string>({
      taskName: 'summarizeArticleStream',
      signal: options?.signal,
      geminiAction: () =>
        streamGenerateContent({
          apiKey,
          prompt: userPrompt,
          systemInstruction,
          config: options?.config,
          signal: options?.signal,
          onChunk: options?.onChunk,
        }),
      groqAction: groqKey
        ? () =>
            streamGenerateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(userPrompt, systemInstruction),
              signal: options?.signal,
              onChunk: options?.onChunk,
            })
        : undefined,
    });

    return parseSummary(rawResponse);
  }

  /**
   * Summarizes YouTube video transcripts (non-streaming)
   */
  public static async summarizeYouTube(
    transcript: string,
    options?: SummarizeYouTubeOptions
  ): Promise<StructuredSummary> {
    const apiKey = await this.resolveApiKey(options?.apiKey);
    const groqKey = await this.resolveGroqApiKey();
    const language = await this.resolveLanguage(options?.language);

    const { systemInstruction, userPrompt } = buildYouTubeSummaryPrompt(transcript, {
      ...options,
      language,
    });

    const rawResponse = await this.executeWithResilience<string>({
      taskName: 'summarizeYouTube',
      signal: options?.signal,
      geminiAction: () =>
        generateContent({
          apiKey,
          prompt: userPrompt,
          systemInstruction,
          config: options?.config,
          signal: options?.signal,
        }),
      groqAction: groqKey
        ? () =>
            generateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(userPrompt, systemInstruction),
              signal: options?.signal,
            })
        : undefined,
    });

    return parseSummary(rawResponse);
  }

  /**
   * Summarizes YouTube video transcripts with real-time SSE streaming
   */
  public static async summarizeYouTubeStream(
    transcript: string,
    options?: SummarizeYouTubeOptions
  ): Promise<StructuredSummary> {
    const apiKey = await this.resolveApiKey(options?.apiKey);
    const groqKey = await this.resolveGroqApiKey();
    const language = await this.resolveLanguage(options?.language);

    const { systemInstruction, userPrompt } = buildYouTubeSummaryPrompt(transcript, {
      ...options,
      language,
    });

    const rawResponse = await this.executeWithResilience<string>({
      taskName: 'summarizeYouTubeStream',
      signal: options?.signal,
      geminiAction: () =>
        streamGenerateContent({
          apiKey,
          prompt: userPrompt,
          systemInstruction,
          config: options?.config,
          signal: options?.signal,
          onChunk: options?.onChunk,
        }),
      groqAction: groqKey
        ? () =>
            streamGenerateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(userPrompt, systemInstruction),
              signal: options?.signal,
              onChunk: options?.onChunk,
            })
        : undefined,
    });

    return parseSummary(rawResponse);
  }

  /**
   * Grounded Page Chat or unrestricted LLM Chat with real-time SSE streaming
   */
  public static async groundedChatStream(options: {
    query: string;
    context?: PageContext | null;
    history?: ChatMessage[];
    language?: SupportedLanguage;
    apiKey?: string;
    config?: GeminiGenerationConfig;
    signal?: AbortSignal;
    onChunk?: (chunk: string, accumulated: string) => void;
    mode?: ChatMode;
  }): Promise<string> {
    const apiKey = await this.resolveApiKey(options.apiKey);
    const groqKey = await this.resolveGroqApiKey();
    const language = await this.resolveLanguage(options.language);
    const mode = options.mode || 'grounded';

    const systemInstruction = buildChatSystemInstruction(options.context, language, mode);
    const contents = buildGroundedChatContents(options.query, options.history, options.context || undefined);

    return this.executeWithResilience<string>({
      taskName: 'groundedChatStream',
      signal: options.signal,
      geminiAction: () =>
        streamGenerateContent({
          apiKey,
          prompt: contents,
          systemInstruction,
          config: options.config,
          signal: options.signal,
          onChunk: options.onChunk,
        }),
      groqAction: groqKey
        ? () =>
            streamGenerateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(contents, systemInstruction),
              signal: options.signal,
              onChunk: options.onChunk,
            })
        : undefined,
    });
  }

  /**
   * Routes visual inspection ("Screenshot-and-Ask") requests to gemini-2.5-flash
   * with base64 image and real-time streaming token output (Task 2.4).
   * Note: Vision requests are not routed to text-only Groq Llama models.
   */
  public static async inspectVisualStream(
    options: VisualInspectionOptions
  ): Promise<string> {
    const apiKey = await this.resolveApiKey(options.apiKey);
    const language = await this.resolveLanguage(options.language);

    const isHinglish = language === 'hinglish';
    const contextPrefix = options.pageContext
      ? `Webpage Title: "${options.pageContext.title}"\nWebpage URL: ${options.pageContext.url}\n\n`
      : '';

    const systemInstruction = isHinglish
      ? `Aap Madadgar ke Visual Intelligence Engine hain. User ki active browser screen ke screenshot ko deeply analyze karein. Charts, diagrams, user interface, tables, text aur visuals par puche gaye sawalon ka Hinglish (Roman Urdu/Hindi) mein accurate aur grounded jawab dein. Agar visuals mein koi information clear nahi hai toh saaf batayein.`
      : `You are Madadgar's Visual Intelligence Engine. Carefully analyze the provided browser viewport screenshot. Accurately answer questions regarding charts, graphs, tables, UI diagrams, error codes, visual layout, and visible text. Be concise, grounded strictly in the visible pixels, and highlight key visual observations. If information is not visible in the screenshot, clearly state so.`;

    const contents: GeminiContent[] = [
      {
        role: 'user',
        parts: [
          { text: `${contextPrefix}${options.prompt}` },
          {
            inlineData: {
              mimeType: options.mimeType || 'image/jpeg',
              data: options.imageBase64,
            },
          },
        ],
      },
    ];

    return this.executeWithResilience<string>({
      taskName: 'inspectVisualStream',
      signal: options.signal,
      geminiAction: () =>
        streamGenerateContent({
          apiKey,
          prompt: contents,
          model: GEMINI_VISION_MODEL,
          systemInstruction,
          config: options.config,
          signal: options.signal,
          onChunk: options.onChunk,
        }),
    });
  }

  /**
   * Non-streaming visual inspection ("Screenshot-and-Ask") using gemini-2.5-flash (Task 2.4).
   */
  public static async inspectVisual(
    options: VisualInspectionOptions
  ): Promise<string> {
    const apiKey = await this.resolveApiKey(options.apiKey);
    const language = await this.resolveLanguage(options.language);

    const isHinglish = language === 'hinglish';
    const contextPrefix = options.pageContext
      ? `Webpage Title: "${options.pageContext.title}"\nWebpage URL: ${options.pageContext.url}\n\n`
      : '';

    const systemInstruction = isHinglish
      ? `Aap Madadgar ke Visual Intelligence Engine hain. User ki active browser screen ke screenshot ko deeply analyze karein. Charts, diagrams, user interface, tables, text aur visuals par puche gaye sawalon ka Hinglish (Roman Urdu/Hindi) mein accurate aur grounded jawab dein.`
      : `You are Madadgar's Visual Intelligence Engine. Carefully analyze the provided browser viewport screenshot. Accurately answer questions regarding charts, graphs, tables, UI diagrams, error codes, visual layout, and visible text. Be concise, grounded strictly in the visible pixels, and highlight key visual observations.`;

    const contents: GeminiContent[] = [
      {
        role: 'user',
        parts: [
          { text: `${contextPrefix}${options.prompt}` },
          {
            inlineData: {
              mimeType: options.mimeType || 'image/jpeg',
              data: options.imageBase64,
            },
          },
        ],
      },
    ];

    return this.executeWithResilience<string>({
      taskName: 'inspectVisual',
      signal: options.signal,
      geminiAction: () =>
        generateContent({
          apiKey,
          prompt: contents,
          model: GEMINI_VISION_MODEL,
          systemInstruction,
          config: options.config,
          signal: options.signal,
        }),
    });
  }

  /**
   * General purpose completion generation
   */
  public static async complete(options: {
    prompt: string;
    systemInstruction?: string;
    apiKey?: string;
    config?: GeminiGenerationConfig;
    signal?: AbortSignal;
  }): Promise<string> {
    const apiKey = await this.resolveApiKey(options.apiKey);
    const groqKey = await this.resolveGroqApiKey();

    return this.executeWithResilience<string>({
      taskName: 'complete',
      signal: options.signal,
      geminiAction: () =>
        generateContent({
          apiKey,
          prompt: options.prompt,
          systemInstruction: options.systemInstruction,
          config: options.config,
          signal: options.signal,
        }),
      groqAction: groqKey
        ? () =>
            generateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(
                options.prompt,
                options.systemInstruction
              ),
              signal: options.signal,
            })
        : undefined,
    });
  }

  /**
   * General purpose streaming completion generation
   */
  public static async completeStream(options: {
    prompt: string;
    systemInstruction?: string;
    apiKey?: string;
    config?: GeminiGenerationConfig;
    signal?: AbortSignal;
    onChunk?: (chunk: string, accumulated: string) => void;
  }): Promise<string> {
    const apiKey = await this.resolveApiKey(options.apiKey);
    const groqKey = await this.resolveGroqApiKey();

    return this.executeWithResilience<string>({
      taskName: 'completeStream',
      signal: options.signal,
      geminiAction: () =>
        streamGenerateContent({
          apiKey,
          prompt: options.prompt,
          systemInstruction: options.systemInstruction,
          config: options.config,
          signal: options.signal,
          onChunk: options.onChunk,
        }),
      groqAction: groqKey
        ? () =>
            streamGenerateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(
                options.prompt,
                options.systemInstruction
              ),
              signal: options.signal,
              onChunk: options.onChunk,
            })
        : undefined,
    });
  }

  /**
   * "Find It For Me" Natural Language Element Locator (Task 3.4)
   * Analyzes active page interactive elements and identifies target element matching user query.
   */
  public static async locateElement(
    query: string,
    elements: ScannedElement[],
    options?: BaseAIOptions
  ): Promise<ElementLocatorResult> {
    if (!elements || elements.length === 0) {
      return {
        targetId: null,
        reason: 'No interactive elements detected on this page.',
        confidence: 'low',
      };
    }

    const apiKey = await this.resolveApiKey(options?.apiKey);
    const groqKey = await this.resolveGroqApiKey();
    const language = await this.resolveLanguage(options?.language);

    const actionMap = serializeActionMap(elements, { includeValues: true, maxElements: 120 });
    const { systemInstruction, userPrompt } = buildElementLocatorPrompt(query, actionMap, language);

    const rawResponse = await this.executeWithResilience<string>({
      taskName: 'locateElement',
      signal: options?.signal,
      geminiAction: () =>
        generateContent({
          apiKey,
          prompt: userPrompt,
          systemInstruction,
          config: options?.config,
          signal: options?.signal,
        }),
      groqAction: groqKey
        ? () =>
            generateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(userPrompt, systemInstruction),
              signal: options?.signal,
            })
        : undefined,
    });

    const rawString =
      typeof rawResponse === 'string'
        ? rawResponse
        : (rawResponse as any)?.text || JSON.stringify(rawResponse);

    return parseElementLocatorResponse(rawString);
  }

  /**
   * HITL Agent Action Planner (Task 3.6)
   * Proposes the single best next action adhering to architecture.md Section 5.2.
   * Includes strict JSON validation and automatic error-correction retry.
   */
  public static async proposeNextAction(
    goal: string,
    elements: ScannedElement[],
    history: AgentTaskStepHistory[] = [],
    profileMemory?: UserProfileMemory,
    options?: BaseAIOptions
  ): Promise<AgentActionProposal> {
    if (!elements || elements.length === 0) {
      return {
        action: 'fail',
        reason: 'No interactive elements detected on the active webpage to interact with.',
      };
    }

    const apiKey = await this.resolveApiKey(options?.apiKey);
    const groqKey = await this.resolveGroqApiKey();
    const language = await this.resolveLanguage(options?.language);

    // Compress action map within 2200 token budget
    const { serialized: actionMap } = compressActionMapToBudget(elements, 2200);

    const { systemInstruction, userPrompt } = buildAgentPlannerPrompt(
      goal,
      actionMap,
      history,
      profileMemory,
      language
    );

    const rawResponse = await this.executeWithResilience<string>({
      taskName: 'proposeNextAction',
      signal: options?.signal,
      geminiAction: () =>
        generateContent({
          apiKey,
          prompt: userPrompt,
          systemInstruction,
          config: {
            temperature: 0.2,
            ...options?.config,
          },
          signal: options?.signal,
        }),
      groqAction: groqKey
        ? () =>
            generateGroqContent({
              apiKey: groqKey,
              messages: formatGeminiPromptToGroqMessages(userPrompt, systemInstruction),
              signal: options?.signal,
            })
        : undefined,
    });

    const rawString =
      typeof rawResponse === 'string'
        ? rawResponse
        : (rawResponse as any)?.text || JSON.stringify(rawResponse);

    try {
      return parseAgentActionProposal(rawString);
    } catch (parseErr: unknown) {
      console.warn(
        '[AIGateway] Initial proposal parsing failed, retrying with error-correction prompt:',
        parseErr
      );

      // Attempt 1 Error Correction Retry
      const errorMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      const repair = buildErrorCorrectionPrompt(rawString, errorMsg);

      const repairedRaw = await this.executeWithResilience<string>({
        taskName: 'proposeNextAction_repair',
        signal: options?.signal,
        geminiAction: () =>
          generateContent({
            apiKey,
            prompt: repair.userPrompt,
            systemInstruction: repair.systemInstruction,
            config: { temperature: 0.1 },
            signal: options?.signal,
          }),
        groqAction: groqKey
          ? () =>
              generateGroqContent({
                apiKey: groqKey,
                messages: formatGeminiPromptToGroqMessages(
                  repair.userPrompt,
                  repair.systemInstruction
                ),
                signal: options?.signal,
              })
          : undefined,
      });

      const repairedString =
        typeof repairedRaw === 'string'
          ? repairedRaw
          : (repairedRaw as any)?.text || JSON.stringify(repairedRaw);

      return parseAgentActionProposal(repairedString);
    }
  }
}

export { GeminiApiError, GroqApiError };
