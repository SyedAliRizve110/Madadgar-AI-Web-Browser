/**
 * Groq Whisper Cloud STT Client (Task 5.5)
 * Calls Groq's high-speed Whisper Large v3 endpoint (`whisper-large-v3`) via multipart upload.
 * Acts as the cloud speech-to-text fallback when local Web Speech encounters noise,
 * heavy dialect/Hinglish ambiguity, or is unsupported in the host browser.
 */

import { GROQ_API_BASE_URL, DEFAULT_GROQ_WHISPER_MODEL } from '@/common/constants';
import { getSettings } from '@/common/storage_adapter';

export class WhisperApiError extends Error {
  public status: number;
  public statusText: string;
  public details?: unknown;

  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message);
    this.name = 'WhisperApiError';
    this.status = status;
    this.statusText = statusText;
    this.details = details;
  }

  public get isRateLimited(): boolean {
    return this.status === 429;
  }

  public get isInvalidKey(): boolean {
    return this.status === 401;
  }
}

export interface WhisperTranscribeOptions {
  apiKey?: string;
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  filename?: string;
  signal?: AbortSignal;
}

export interface WhisperTranscribeResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
}

export class WhisperClient {
  private customApiKey?: string;

  constructor(apiKey?: string) {
    this.customApiKey = apiKey;
  }

  /**
   * Resolves the active Groq API key (passed key > stored settings > dev env).
   */
  public async getApiKey(options?: { fallbackToEnv?: boolean }): Promise<string> {
    if (this.customApiKey !== undefined) {
      if (this.customApiKey.trim()) {
        return this.customApiKey.trim();
      }
      throw new WhisperApiError(
        'Groq API key not configured. Cloud Whisper fallback requires a Groq API key.',
        401,
        'Unauthorized'
      );
    }
    const settings = await getSettings(options);
    if (settings.groqApiKey && settings.groqApiKey.trim()) {
      return settings.groqApiKey.trim();
    }
    throw new WhisperApiError(
      'Groq API key not configured. Cloud Whisper fallback requires a Groq API key.',
      401,
      'Unauthorized'
    );
  }

  /**
   * Transcribes an audio Blob using Groq Whisper (whisper-large-v3).
   */
  public async transcribe(
    audioBlob: Blob,
    options: WhisperTranscribeOptions = {}
  ): Promise<WhisperTranscribeResponse> {
    const apiKey = options.apiKey !== undefined ? options.apiKey : await this.getApiKey();
    if (!apiKey || !apiKey.trim()) {
      throw new WhisperApiError(
        'Groq API key not configured. Cloud Whisper fallback requires a Groq API key.',
        401,
        'Unauthorized'
      );
    }
    const model = options.model || DEFAULT_GROQ_WHISPER_MODEL;
    const filename = options.filename || 'recording.webm';

    const formData = new FormData();
    formData.append('file', audioBlob, filename);
    formData.append('model', model);

    if (options.language) {
      formData.append('language', options.language);
    }

    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    if (typeof options.temperature === 'number') {
      formData.append('temperature', String(options.temperature));
    } else {
      formData.append('temperature', '0.0');
    }

    formData.append('response_format', 'verbose_json');

    const endpoint = `${GROQ_API_BASE_URL}/audio/transcriptions`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: options.signal,
      });
    } catch (networkErr: any) {
      if (networkErr.name === 'AbortError') {
        throw networkErr;
      }
      throw new WhisperApiError(
        `Failed to connect to Groq Whisper endpoint: ${networkErr.message || 'Network error'}`,
        0,
        'NetworkError'
      );
    }

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      const errMsg =
        typeof errorBody === 'object' && errorBody?.error?.message
          ? errorBody.error.message
          : `Groq Whisper API returned HTTP ${response.status}: ${response.statusText}`;

      throw new WhisperApiError(errMsg, response.status, response.statusText, errorBody);
    }

    const data = await response.json();
    return {
      text: (data.text || '').trim(),
      language: data.language,
      duration: data.duration,
      segments: data.segments,
    };
  }
}
