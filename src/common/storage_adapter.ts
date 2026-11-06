/**
 * Madadgar Local Storage Adapter
 * Strongly-typed async wrapper around chrome.storage.local.
 * Provides fallback store for testing and browser preview environments.
 * Strictly local-only: Zero network calls or external telemetry.
 */

import { STORAGE_KEYS, DEFAULT_LANGUAGE } from './constants';
import type { AppSettings, StorageSchema, SupportedLanguage } from './types';

// In-memory fallback for unit testing and non-extension contexts
const memoryStore = new Map<string, unknown>();

const isChromeStorageAvailable = (): boolean => {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
};

/**
 * Low-level storage getter
 */
export async function getStorageItem<K extends keyof StorageSchema>(
  key: K
): Promise<StorageSchema[K] | undefined> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key as string], (result) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(result[key as string] as StorageSchema[K] | undefined);
      });
    });
  }

  // Fallback to memoryStore
  return memoryStore.get(key as string) as StorageSchema[K] | undefined;
}

/**
 * Low-level storage setter
 */
export async function setStorageItem<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key as string]: value }, () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  // Fallback to memoryStore
  memoryStore.set(key as string, value);
}

/**
 * Low-level storage remover
 */
export async function removeStorageItem<K extends keyof StorageSchema>(
  key: K
): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key as string], () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  memoryStore.delete(key as string);
}

/**
 * Clear all Madadgar local storage items
 */
export async function clearAllStorage(): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  memoryStore.clear();
}

/**
 * Reads developer-configured Gemini key from .env if present in the build environment
 */
export function getDevEnvGeminiKey(): string | undefined {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;
  if (metaEnv) {
    if (metaEnv.GEMINI_API_KEY) return metaEnv.GEMINI_API_KEY;
    if (metaEnv.VITE_GEMINI_API_KEY) return metaEnv.VITE_GEMINI_API_KEY;
  }
  return undefined;
}

/**
 * Reads developer-configured Groq/Grok fallback key from .env if present in the build environment
 */
export function getDevEnvGroqKey(): string | undefined {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;
  if (metaEnv) {
    if (metaEnv.GROQ_API_KEY) return metaEnv.GROQ_API_KEY;
    if (metaEnv.GROK_API_KEY) return metaEnv.GROK_API_KEY;
    if (metaEnv.VITE_GROQ_API_KEY) return metaEnv.VITE_GROQ_API_KEY;
    if (metaEnv.VITE_GROK_API_KEY) return metaEnv.VITE_GROK_API_KEY;
  }
  return undefined;
}

/**
 * Retrieve current user settings.
 * If API keys are not yet set in local storage, falls back to .env development keys if fallbackToEnv is true.
 */
export async function getSettings(options?: { fallbackToEnv?: boolean }): Promise<AppSettings> {
  const fallbackToEnv = options?.fallbackToEnv ?? true;

  const [storedSettings, storedGeminiKey, storedGroqKey, storedLang] = await Promise.all([
    getStorageItem(STORAGE_KEYS.SETTINGS),
    getStorageItem(STORAGE_KEYS.GEMINI_API_KEY),
    getStorageItem(STORAGE_KEYS.GROQ_API_KEY),
    getStorageItem(STORAGE_KEYS.PREFERRED_LANGUAGE),
  ]);

  const geminiApiKey =
    storedSettings?.geminiApiKey ||
    storedGeminiKey ||
    (fallbackToEnv ? getDevEnvGeminiKey() : undefined) ||
    '';

  const groqApiKey =
    storedSettings?.groqApiKey ||
    storedGroqKey ||
    (fallbackToEnv ? getDevEnvGroqKey() : undefined) ||
    '';

  const defaultLanguage: SupportedLanguage =
    storedSettings?.defaultLanguage || storedLang || DEFAULT_LANGUAGE;

  return {
    geminiApiKey,
    groqApiKey,
    defaultLanguage,
  };
}

/**
 * Save settings and sync with individual convenience keys
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await Promise.all([
    setStorageItem(STORAGE_KEYS.SETTINGS, settings),
    setStorageItem(STORAGE_KEYS.GEMINI_API_KEY, settings.geminiApiKey),
    setStorageItem(STORAGE_KEYS.GROQ_API_KEY, settings.groqApiKey || ''),
    setStorageItem(STORAGE_KEYS.PREFERRED_LANGUAGE, settings.defaultLanguage),
  ]);
}

/**
 * Convenience helper to get the active Gemini API key
 */
export async function getGeminiApiKey(): Promise<string> {
  const settings = await getSettings();
  return settings.geminiApiKey;
}

/**
 * Convenience helper to get the active Groq API key
 */
export async function getGroqApiKey(): Promise<string | undefined> {
  const settings = await getSettings();
  return settings.groqApiKey || undefined;
}

/**
 * Convenience helper to get preferred language
 */
export async function getPreferredLanguage(): Promise<SupportedLanguage> {
  const settings = await getSettings();
  return settings.defaultLanguage;
}

/**
 * Convenience helper to set preferred language
 */
export async function setPreferredLanguage(lang: SupportedLanguage): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, defaultLanguage: lang });
}
