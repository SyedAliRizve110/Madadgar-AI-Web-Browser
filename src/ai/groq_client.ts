/**
 * Groq REST API Client (Task 2.5)
 * Lightweight OpenAI-compatible REST client for Groq's high-speed inference endpoint.
 * Acts as the free-tier fallback engine using llama-3.3-70b-versatile.
 */

import { GROQ_API_BASE_URL, DEFAULT_GROQ_MODEL } from '@/common/constants';
import type { GeminiContent } from './gemini_client';

export class GroqApiError extends Error {
  public status: number;
  public statusText: string;
  public details?: unknown;

  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message);
    this.name = 'GroqApiError';
    this.status = status;
    this.statusText = statusText;
    this.details = details;
  }

  public get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqRequestOptions {
  apiKey: string;
  messages: GroqMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface GroqStreamRequestOptions extends GroqRequestOptions {
  onChunk?: (chunkText: string, accumulatedText: string) => void;
}

/**
 * Converts Gemini prompt inputs into OpenAI-compatible Groq messages
 */
export function formatGeminiPromptToGroqMessages(
  prompt: string | GeminiContent[],
  systemInstruction?: string
): GroqMessage[] {
  const messages: GroqMessage[] = [];

  if (systemInstruction && systemInstruction.trim()) {
    messages.push({
      role: 'system',
      content: systemInstruction.trim(),
    });
  }

  if (typeof prompt === 'string') {
    messages.push({
      role: 'user',
      content: prompt,
    });
    return messages;
  }

  if (Array.isArray(prompt)) {
    for (const c of prompt) {
      const role = c.role === 'model' ? 'assistant' : 'user';
      const text = c.parts
        .map((p) => p.text || '')
        .filter(Boolean)
        .join('\n')
        .trim();

      if (text) {
        messages.push({ role, content: text });
      }
    }
  }

  // Ensure there is at least one user message
  if (messages.length === 0 || !messages.some((m) => m.role === 'user')) {
    messages.push({ role: 'user', content: 'Hello' });
  }

  return messages;
}

/**
 * Non-streaming content generation using Groq API
 */
export async function generateGroqContent(options: GroqRequestOptions): Promise<string> {
  const {
    apiKey,
    messages,
    model = DEFAULT_GROQ_MODEL,
    temperature = 0.3,
    maxTokens = 4096,
    signal,
  } = options;

  const url = `${GROQ_API_BASE_URL}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal,
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => null);
    const errorMessage =
      errorJson?.error?.message || `Groq HTTP ${response.status}: ${response.statusText}`;
    throw new GroqApiError(errorMessage, response.status, response.statusText, errorJson);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new GroqApiError('Empty response content received from Groq API', 500, 'Invalid response');
  }

  return text;
}

/**
 * Streaming content generation using Groq API via Server-Sent Events (SSE)
 */
export async function streamGenerateGroqContent(options: GroqStreamRequestOptions): Promise<string> {
  const {
    apiKey,
    messages,
    model = DEFAULT_GROQ_MODEL,
    temperature = 0.3,
    maxTokens = 4096,
    signal,
    onChunk,
  } = options;

  const url = `${GROQ_API_BASE_URL}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => null);
    const errorMessage =
      errorJson?.error?.message || `Groq HTTP ${response.status}: ${response.statusText}`;
    throw new GroqApiError(errorMessage, response.status, response.statusText, errorJson);
  }

  if (!response.body) {
    throw new GroqApiError('Response body is null, streaming not supported', 500, 'No stream');
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
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const payload = trimmed.slice(6).trim();
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const chunk = parsed?.choices?.[0]?.delta?.content;
          if (chunk) {
            accumulatedText += chunk;
            if (onChunk) {
              onChunk(chunk, accumulatedText);
            }
          }
        } catch {
          // ignore malformed partial SSE chunks
        }
      }
    }
  }

  // Handle any final data in buffer
  if (buffer.trim().startsWith('data: ')) {
    const payload = buffer.trim().slice(6).trim();
    if (payload !== '[DONE]') {
      try {
        const parsed = JSON.parse(payload);
        const chunk = parsed?.choices?.[0]?.delta?.content;
        if (chunk) {
          accumulatedText += chunk;
          if (onChunk) {
            onChunk(chunk, accumulatedText);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return accumulatedText;
}

