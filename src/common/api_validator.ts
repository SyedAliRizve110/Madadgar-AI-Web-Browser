/**
 * API Key Validation Utilities
 * Performs direct lightweight validation pings strictly to the official provider endpoints.
 * Never transmits keys to any 3rd party or telemetry servers.
 */

import { GEMINI_API_BASE_URL, GROQ_API_BASE_URL } from './constants';

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a Google Gemini API Key by performing a model list request.
 * This consumes zero token quota and deterministically verifies key authorization.
 */
export async function validateGeminiApiKey(apiKey: string): Promise<KeyValidationResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  try {
    const url = `${GEMINI_API_BASE_URL}/models?key=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    const data = await response.json().catch(() => null);
    const message = data?.error?.message || `Validation failed with status ${response.status} (${response.statusText})`;
    return { valid: false, error: message };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error connecting to Gemini API';
    return { valid: false, error: message };
  }
}

/**
 * Validates a Groq API Key by performing a lightweight models list request.
 */
export async function validateGroqApiKey(apiKey: string): Promise<KeyValidationResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  try {
    const url = `${GROQ_API_BASE_URL}/models`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${trimmed}`,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    const data = await response.json().catch(() => null);
    const message = data?.error?.message || `Validation failed with status ${response.status} (${response.statusText})`;
    return { valid: false, error: message };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error connecting to Groq API';
    return { valid: false, error: message };
  }
}

