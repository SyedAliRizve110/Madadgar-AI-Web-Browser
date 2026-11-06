import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSettings,
  saveSettings,
  getGeminiApiKey,
  getGroqApiKey,
  getPreferredLanguage,
  setPreferredLanguage,
  clearAllStorage,
  getStorageItem,
  getDevEnvGeminiKey,
  getDevEnvGroqKey,
} from '@/common/storage_adapter';
import { STORAGE_KEYS } from '@/common/constants';
import type { AppSettings } from '@/common/types';

describe('Storage Adapter', () => {
  beforeEach(async () => {
    await clearAllStorage();
  });

  it('saves and retrieves user settings correctly', async () => {
    const testSettings: AppSettings = {
      geminiApiKey: 'test-gemini-key-12345',
      groqApiKey: 'test-groq-key-67890',
      defaultLanguage: 'hinglish',
    };

    await saveSettings(testSettings);

    const retrieved = await getSettings();
    expect(retrieved.geminiApiKey).toBe('test-gemini-key-12345');
    expect(retrieved.groqApiKey).toBe('test-groq-key-67890');
    expect(retrieved.defaultLanguage).toBe('hinglish');
  });

  it('provides dedicated convenience accessors for api key and language', async () => {
    await saveSettings({
      geminiApiKey: 'convenience-key-abc',
      groqApiKey: 'convenience-groq-xyz',
      defaultLanguage: 'en',
    });

    const geminiKey = await getGeminiApiKey();
    expect(geminiKey).toBe('convenience-key-abc');

    const groqKey = await getGroqApiKey();
    expect(groqKey).toBe('convenience-groq-xyz');

    const lang = await getPreferredLanguage();
    expect(lang).toBe('en');

    await setPreferredLanguage('hinglish');
    const updatedLang = await getPreferredLanguage();
    expect(updatedLang).toBe('hinglish');
  });

  it('correctly detects dev environment keys from .env', () => {
    const devGeminiKey = getDevEnvGeminiKey();
    expect(devGeminiKey).toBeDefined();
    expect(devGeminiKey).toContain('AQ.');

    const devGroqKey = getDevEnvGroqKey();
    expect(devGroqKey).toBeDefined();
    expect(devGroqKey).toContain('gsk_');
  });

  it('clears storage completely', async () => {
    await saveSettings({
      geminiApiKey: 'to-be-cleared',
      groqApiKey: 'groq-to-be-cleared',
      defaultLanguage: 'hinglish',
    });

    await clearAllStorage();

    const storedItem = await getStorageItem(STORAGE_KEYS.SETTINGS);
    expect(storedItem).toBeUndefined();

    const empty = await getSettings({ fallbackToEnv: false });
    expect(empty.geminiApiKey).toBe('');
    expect(empty.groqApiKey).toBe('');
    expect(empty.defaultLanguage).toBe('en');
  });
});
