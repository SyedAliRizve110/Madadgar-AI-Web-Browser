/**
 * Google Gemini REST API Client
 * Direct HTTP calls to Gemini v1beta REST endpoints without external SDK bloat.
 * Supports standard generation and real-time streaming via Server-Sent Events (alt=sse).
 */

import { GEMINI_API_BASE_URL, DEFAULT_GEMINI_MODEL, GEMINI_LITE_MODELS } from '@/common/constants';

export class GeminiApiError extends Error {
  public status: number;
  public statusText: string;
  public details?: unknown;

  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = status;
    this.statusText = statusText;
    this.details = details;
  }

  public get isRateLimited(): boolean {
    return this.status === 429;
  }

  public get isModelUnavailable(): boolean {
    return this.status === 404;
  }
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export interface GeminiRequestOptions {
  apiKey: string;
  prompt: string | GeminiContent[];
  systemInstruction?: string;
  model?: string;
  config?: GeminiGenerationConfig;
  signal?: AbortSignal;
}

export interface GeminiStreamRequestOptions extends GeminiRequestOptions {
  onChunk?: (chunkText: string, accumulatedText: string) => void;
}

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

export interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}

/**
 * Builds the standard Gemini request body
 */
function buildRequestBody(
  prompt: string | GeminiContent[],
  systemInstruction?: string,
  config?: GeminiGenerationConfig
) {
  const contents: GeminiContent[] = Array.isArray(prompt)
    ? prompt
    : [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ];

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: config?.temperature ?? 0.2,
      maxOutputTokens: config?.maxOutputTokens ?? 2048,
      ...(config?.topP !== undefined ? { topP: config.topP } : {}),
      ...(config?.topK !== undefined ? { topK: config.topK } : {}),
      ...(config?.stopSequences ? { stopSequences: config.stopSequences } : {}),
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  return body;
}

/**
 * Non-streaming content generation
 */
export async function generateContent(options: GeminiRequestOptions): Promise<string> {
  const { apiKey, prompt, systemInstruction, config, signal } = options;
  const initialModel = options.model || DEFAULT_GEMINI_MODEL;

  // Candidate models to attempt if initial returns 404 (model superseded)
  const modelsToTry = [initialModel, ...GEMINI_LITE_MODELS.filter((m) => m !== initialModel)];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const url = `${GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const body = buildRequestBody(prompt, systemInstruction, config);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => null);
        const errorMessage =
          errorJson?.error?.message || `HTTP ${response.status}: ${response.statusText}`;

        // If model is superseded/not found (404), try next model in fallback list
        if (response.status === 404 && modelsToTry.indexOf(model) < modelsToTry.length - 1) {
          lastError = new GeminiApiError(errorMessage, response.status, response.statusText, errorJson);
          continue;
        }

        throw new GeminiApiError(errorMessage, response.status, response.statusText, errorJson);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;

      if (typeof text !== 'string') {
        throw new GeminiApiError('Invalid or empty response format from Gemini API', 500, 'Empty response', data);
      }

      return text;
    } catch (err: unknown) {
      if (err instanceof GeminiApiError && err.status === 404 && modelsToTry.indexOf(model) < modelsToTry.length - 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new GeminiApiError('All candidate Gemini models failed', 500, 'Model error');
}

/**
 * Streaming content generation using Server-Sent Events (alt=sse)
 */
export async function streamGenerateContent(options: GeminiStreamRequestOptions): Promise<string> {
  const { apiKey, prompt, systemInstruction, config, signal, onChunk } = options;
  const initialModel = options.model || DEFAULT_GEMINI_MODEL;

  const modelsToTry = [initialModel, ...GEMINI_LITE_MODELS.filter((m) => m !== initialModel)];
  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const url = `${GEMINI_API_BASE_URL}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      const body = buildRequestBody(prompt, systemInstruction, config);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => null);
        const errorMessage =
          errorJson?.error?.message || `HTTP ${response.status}: ${response.statusText}`;

        if (response.status === 404 && modelsToTry.indexOf(model) < modelsToTry.length - 1) {
          lastError = new GeminiApiError(errorMessage, response.status, response.statusText, errorJson);
          continue;
        }

        throw new GeminiApiError(errorMessage, response.status, response.statusText, errorJson);
      }

      if (!response.body) {
        throw new GeminiApiError('Response body is null, streaming not supported in this runtime', 500, 'No stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete fragment in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const chunkPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (chunkPart) {
                accumulatedText += chunkPart;
                if (onChunk) {
                  onChunk(chunkPart, accumulatedText);
                }
              }
            } catch {
              // Ignore malformed intermediate JSON chunk and continue
            }
          }
        }
      }

      // Flush any remaining buffer if it starts with data:
      if (buffer.trim().startsWith('data: ')) {
        try {
          const jsonStr = buffer.trim().slice(6).trim();
          const parsed = JSON.parse(jsonStr);
          const chunkPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunkPart) {
            accumulatedText += chunkPart;
            if (onChunk) {
              onChunk(chunkPart, accumulatedText);
            }
          }
        } catch {
          // ignore
        }
      }

      return accumulatedText;
    } catch (err: unknown) {
      if (err instanceof GeminiApiError && err.status === 404 && modelsToTry.indexOf(model) < modelsToTry.length - 1) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new GeminiApiError('All streaming candidate Gemini models failed', 500, 'Model error');
}

