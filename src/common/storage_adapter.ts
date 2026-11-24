/**
 * Madadgar Local Storage Adapter
 * Strongly-typed async wrapper around browser.storage.local (webextension-polyfill) & chrome.storage.local.
 * Provides fallback store for testing and browser preview environments.
 * Strictly local-only: Zero network calls or external telemetry.
 */

import { STORAGE_KEYS, DEFAULT_LANGUAGE, DEFAULT_USER_PROFILE, DEMO_USER_PROFILE, DEFAULT_SAVED_SKILLS } from './constants';
import type { AppSettings, StorageSchema, SupportedLanguage, AgentTaskSession, AuditLogEntry, UserProfileMemory, SavedSkill } from './types';
import { getBrowser, isChromium } from './browser_adapter';

// In-memory fallback for unit testing and non-extension contexts
const memoryStore = new Map<string, unknown>();

const isStorageAvailable = (): boolean => {
  const b = getBrowser();
  if (b?.storage?.local) return true;
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
};

export interface StorageUsageReport {
  bytesInUse: number;
  quotaBytes: number;
  percentageUsed: number;
}

/**
 * Low-level storage getter (supports webextension-polyfill, native browser.*, and chrome.storage.local)
 * In Chromium, uses direct native chrome.storage.local for zero-overhead performance.
 */
export async function getStorageItem<K extends keyof StorageSchema>(
  key: K
): Promise<StorageSchema[K] | undefined> {
  // 1. Chromium fast-path: zero-overhead native access
  if (isChromium() && typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key as string], (result) => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(result?.[key as string] as StorageSchema[K] | undefined);
      });
    });
  }

  // 2. Firefox / WebExtension polyfill: browser.storage.local
  const b = getBrowser();
  if (b?.storage?.local && typeof b.storage.local.get === 'function') {
    try {
      const result = await b.storage.local.get(key as string);
      return (result as Record<string, unknown>)[key as string] as StorageSchema[K] | undefined;
    } catch {
      // Fall through to callback-style chrome.storage.local
    }
  }

  // 3. Fallback callback-style chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key as string], (result) => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(result?.[key as string] as StorageSchema[K] | undefined);
      });
    });
  }

  // Fallback to memoryStore
  return memoryStore.get(key as string) as StorageSchema[K] | undefined;
}

/**
 * Low-level storage setter with automatic quota recovery
 * In Chromium, uses direct native chrome.storage.local for zero-overhead performance.
 */
export async function setStorageItem<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  // 1. Chromium fast-path: zero-overhead native access
  if (isChromium() && typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key as string]: value }, async () => {
        if (chrome.runtime?.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          if (/quota/i.test(errMsg)) {
            console.warn('[StorageAdapter] Chrome storage quota exceeded. Pruning audit logs...');
            await pruneOldAuditLogsIfNeeded(25);
            chrome.storage.local.set({ [key as string]: value }, () => {
              if (chrome.runtime?.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              resolve();
            });
            return;
          }
          return reject(new Error(errMsg));
        }
        resolve();
      });
    });
  }

  // 2. Firefox / WebExtension polyfill: browser.storage.local
  const b = getBrowser();
  if (b?.storage?.local && typeof b.storage.local.set === 'function') {
    try {
      await b.storage.local.set({ [key as string]: value });
      return;
    } catch (err: unknown) {
      const errMsg = String((err as Error)?.message || '');
      if (/quota/i.test(errMsg)) {
        console.warn('[StorageAdapter] Quota exceeded. Pruning audit logs and retrying...');
        await pruneOldAuditLogsIfNeeded(25);
        await b.storage.local.set({ [key as string]: value });
        return;
      }
      throw err;
    }
  }

  // 3. Fallback callback-style chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key as string]: value }, async () => {
        if (chrome.runtime?.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          if (/quota/i.test(errMsg)) {
            console.warn('[StorageAdapter] Chrome storage quota exceeded. Pruning audit logs...');
            await pruneOldAuditLogsIfNeeded(25);
            chrome.storage.local.set({ [key as string]: value }, () => {
              if (chrome.runtime?.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              resolve();
            });
            return;
          }
          return reject(new Error(errMsg));
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
  // 1. Chromium fast-path
  if (isChromium() && typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key as string], () => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  // 2. Firefox / WebExtension polyfill
  const b = getBrowser();
  if (b?.storage?.local && typeof b.storage.local.remove === 'function') {
    try {
      await b.storage.local.remove(key as string);
      return;
    } catch {
      // Fall through
    }
  }

  // 3. Fallback chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key as string], () => {
        if (chrome.runtime?.lastError) {
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
  // 1. Chromium fast-path
  if (isChromium() && typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  // 2. Firefox / WebExtension polyfill
  const b = getBrowser();
  if (b?.storage?.local && typeof b.storage.local.clear === 'function') {
    try {
      await b.storage.local.clear();
      return;
    } catch {
      // Fall through
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  memoryStore.clear();
}

/**
 * Queries storage usage and quota bounds (supports getBytesInUse on Chrome/Firefox)
 */
export async function getStorageUsage(): Promise<StorageUsageReport> {
  const quotaBytes = 10 * 1024 * 1024; // 10MB standard MV3 quota
  let bytesInUse = 0;

  const b = getBrowser();
  if (b?.storage?.local && typeof (b.storage.local as unknown as { getBytesInUse?: (keys?: unknown) => Promise<number> }).getBytesInUse === 'function') {
    try {
      bytesInUse = await (b.storage.local as unknown as { getBytesInUse: (keys?: unknown) => Promise<number> }).getBytesInUse();
    } catch {
      // Fallback
    }
  } else if (typeof chrome !== 'undefined' && typeof chrome.storage?.local?.getBytesInUse === 'function') {
    try {
      bytesInUse = await new Promise<number>((resolve) => {
        chrome.storage.local.getBytesInUse(null, (bytes) => {
          resolve(bytes || 0);
        });
      });
    } catch {
      // Fallback
    }
  }

  if (!bytesInUse && memoryStore.size > 0) {
    let total = 0;
    for (const [k, v] of memoryStore.entries()) {
      total += (k.length + JSON.stringify(v || '').length) * 2;
    }
    bytesInUse = total;
  }

  const percentageUsed = Math.min(100, Number(((bytesInUse / quotaBytes) * 100).toFixed(2)));
  return {
    bytesInUse,
    quotaBytes,
    percentageUsed,
  };
}

/**
 * Prunes audit logs if local storage consumption is near capacity or when explicitly requested.
 * Returns the number of logs removed.
 */
export async function pruneOldAuditLogsIfNeeded(keepCount = 50): Promise<number> {
  const logs = await getAuditLogs();
  if (logs.length > keepCount) {
    const pruned = logs.slice(0, keepCount);
    const removedCount = logs.length - keepCount;
    // Direct set without triggering recursive prune
    if (isStorageAvailable()) {
      const b = getBrowser();
      if (b?.storage?.local) {
        await b.storage.local.set({ [STORAGE_KEYS.AUDIT_LOGS]: pruned });
      } else if (chrome?.storage?.local) {
        await new Promise<void>((res) => chrome.storage.local.set({ [STORAGE_KEYS.AUDIT_LOGS]: pruned }, () => res()));
      }
    } else {
      memoryStore.set(STORAGE_KEYS.AUDIT_LOGS, pruned);
    }
    return removedCount;
  }
  return 0;
}

export interface StorageQuotaEnforcementResult {
  cleanupTriggered: boolean;
  prunedAuditLogs: number;
  report: StorageUsageReport;
}

/**
 * Task 5.1: Proactively monitors storage usage against a quota threshold (defaults to 80%).
 * If percentageUsed >= thresholdPercent, performs graceful cleanup by pruning
 * audit logs and clearing completed/dormant sessions.
 */
export async function checkAndEnforceStorageQuota(
  thresholdPercent = 80
): Promise<StorageQuotaEnforcementResult> {
  let usage = await getStorageUsage();
  if (usage.percentageUsed < thresholdPercent) {
    return {
      cleanupTriggered: false,
      prunedAuditLogs: 0,
      report: usage,
    };
  }

  console.warn(`[StorageAdapter] Storage quota threshold reached (${usage.percentageUsed}% >= ${thresholdPercent}%). Executing graceful cleanup...`);

  // Prune audit logs down to 25 items
  const prunedCount = await pruneOldAuditLogsIfNeeded(25);

  // If active task session is already completed or stopped, clean it up
  const activeSession = await getActiveAgentSession();
  if (
    activeSession &&
    (activeSession.status === 'TASK_COMPLETED' ||
      activeSession.status === 'TASK_ABORTED' ||
      activeSession.status === 'ERROR' ||
      activeSession.status === 'IDLE')
  ) {
    await clearActiveAgentSession();
  }

  // Recalculate usage report post-cleanup
  usage = await getStorageUsage();

  return {
    cleanupTriggered: true,
    prunedAuditLogs: prunedCount,
    report: usage,
  };
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

/**
 * Task 3.8: Save active agent session state to chrome.storage.local for dormancy survival
 */
export async function saveActiveAgentSession(session: AgentTaskSession): Promise<void> {
  await setStorageItem(STORAGE_KEYS.ACTIVE_TASK_SESSION, session);
}

/**
 * Task 3.8: Retrieve active agent session state from chrome.storage.local
 */
export async function getActiveAgentSession(): Promise<AgentTaskSession | null> {
  const session = await getStorageItem(STORAGE_KEYS.ACTIVE_TASK_SESSION);
  return session || null;
}

/**
 * Task 3.8: Clear active agent session state from chrome.storage.local
 */
export async function clearActiveAgentSession(): Promise<void> {
  await removeStorageItem(STORAGE_KEYS.ACTIVE_TASK_SESSION);
}

/**
 * Task 3.9: Retrieve all action audit logs from local storage
 */
export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const logs = await getStorageItem(STORAGE_KEYS.AUDIT_LOGS);
  return Array.isArray(logs) ? logs : [];
}

/**
 * Task 3.9: Append an action audit log entry to chrome.storage.local
 */
export async function appendAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<AuditLogEntry> {
  const fullEntry: AuditLogEntry = {
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  const existingLogs = await getAuditLogs();
  // Keep up to 200 recent audit logs to prevent excessive local storage consumption
  const updatedLogs = [fullEntry, ...existingLogs].slice(0, 200);
  await setStorageItem(STORAGE_KEYS.AUDIT_LOGS, updatedLogs);

  return fullEntry;
}

/**
 * Task 3.9: Clear all action audit logs
 */
export async function clearAuditLogs(): Promise<void> {
  await setStorageItem(STORAGE_KEYS.AUDIT_LOGS, []);
}

/**
 * Task 3.9: Export all action audit logs as formatted JSON string
 */
export async function exportAuditLogsJson(): Promise<string> {
  const logs = await getAuditLogs();
  return JSON.stringify(logs, null, 2);
}

/**
 * Task 4.1: Retrieve user profile memory from chrome.storage.local
 */
export async function getUserProfile(): Promise<UserProfileMemory> {
  const profile = await getStorageItem(STORAGE_KEYS.PROFILE_MEMORY);
  if (!profile) {
    return {
      personal: { ...DEFAULT_USER_PROFILE.personal },
      academic: { ...DEFAULT_USER_PROFILE.academic },
      professional: {
        ...DEFAULT_USER_PROFILE.professional,
        skills: [...DEFAULT_USER_PROFILE.professional.skills],
      },
      preferences: { ...DEFAULT_USER_PROFILE.preferences },
    };
  }
  return {
    personal: { ...DEFAULT_USER_PROFILE.personal, ...profile.personal },
    academic: {
      ...DEFAULT_USER_PROFILE.academic,
      ...profile.academic,
      institution: profile.academic?.institution || profile.academic?.college || '',
    },
    professional: {
      ...DEFAULT_USER_PROFILE.professional,
      ...profile.professional,
      skills: Array.isArray(profile.professional?.skills) ? [...profile.professional.skills] : [],
    },
    preferences: { ...DEFAULT_USER_PROFILE.preferences, ...profile.preferences },
  };
}

/**
 * Task 4.1: Save user profile memory to chrome.storage.local (strictly local, zero outbound network)
 */
export async function saveUserProfile(profile: UserProfileMemory): Promise<void> {
  await setStorageItem(STORAGE_KEYS.PROFILE_MEMORY, profile);
}

/**
 * Task 4.1: Reset user profile memory in chrome.storage.local
 */
export async function clearUserProfile(): Promise<void> {
  await setStorageItem(STORAGE_KEYS.PROFILE_MEMORY, {
    personal: { ...DEFAULT_USER_PROFILE.personal },
    academic: { ...DEFAULT_USER_PROFILE.academic },
    professional: {
      ...DEFAULT_USER_PROFILE.professional,
      skills: [...DEFAULT_USER_PROFILE.professional.skills],
    },
    preferences: { ...DEFAULT_USER_PROFILE.preferences },
  });
}

/**
 * Task 4.1: Export user profile memory as formatted JSON string
 */
export async function exportUserProfileJson(): Promise<string> {
  const profile = await getUserProfile();
  return JSON.stringify(profile, null, 2);
}

/**
 * Task 4.1: Import and validate user profile memory from a JSON string
 */
export async function importUserProfileJson(jsonString: string): Promise<UserProfileMemory> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON format for user profile.');
    }

    const validatedProfile: UserProfileMemory = {
      personal: {
        fullName: String(parsed.personal?.fullName || ''),
        email: String(parsed.personal?.email || ''),
        phone: String(parsed.personal?.phone || ''),
        location: String(parsed.personal?.location || ''),
      },
      academic: {
        institution: String(parsed.academic?.institution || parsed.academic?.college || ''),
        degree: String(parsed.academic?.degree || ''),
        major: String(parsed.academic?.major || ''),
        graduationYear: String(parsed.academic?.graduationYear || ''),
      },
      professional: {
        skills: Array.isArray(parsed.professional?.skills)
          ? parsed.professional.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
          : typeof parsed.professional?.skills === 'string'
            ? parsed.professional.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [],
        linkedInUrl: String(parsed.professional?.linkedInUrl || ''),
        githubUrl: String(parsed.professional?.githubUrl || ''),
        portfolioUrl: String(parsed.professional?.portfolioUrl || ''),
      },
      preferences: {
        defaultLanguage: parsed.preferences?.defaultLanguage === 'hinglish' ? 'hinglish' : 'en',
        tone: ['formal', 'casual', 'academic'].includes(parsed.preferences?.tone)
          ? parsed.preferences.tone
          : 'formal',
      },
    };

    await saveUserProfile(validatedProfile);
    return validatedProfile;
  } catch (err: any) {
    throw new Error(`Failed to import profile: ${err?.message || 'Invalid format'}`);
  }
}

export { DEFAULT_USER_PROFILE, DEMO_USER_PROFILE, DEFAULT_SAVED_SKILLS };

/**
 * Task 4.3: Retrieve saved skills catalog from chrome.storage.local.
 * If empty or not set, initializes with DEFAULT_SAVED_SKILLS.
 */
export async function getSavedSkills(): Promise<SavedSkill[]> {
  const skills = await getStorageItem(STORAGE_KEYS.SAVED_SKILLS);
  if (!skills || !Array.isArray(skills) || skills.length === 0) {
    await setStorageItem(STORAGE_KEYS.SAVED_SKILLS, [...DEFAULT_SAVED_SKILLS]);
    return [...DEFAULT_SAVED_SKILLS];
  }
  return skills;
}

/**
 * Task 4.3: Save or update a skill in chrome.storage.local
 */
export async function saveSkill(
  skill: Omit<SavedSkill, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
): Promise<SavedSkill> {
  const skills = await getSavedSkills();
  const id = skill.id || `skill_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = skill.createdAt || Date.now();

  const completeSkill: SavedSkill = {
    ...skill,
    id,
    name: skill.name || skill.title || 'Untitled Skill',
    title: skill.title || skill.name || 'Untitled Skill',
    description: skill.description || '',
    promptTemplate: skill.promptTemplate || (skill as any).userPromptTemplate || '',
    category: skill.category || 'custom',
    tags: Array.isArray(skill.tags) ? skill.tags : [],
    requiresProfile: Boolean(skill.requiresProfile),
    targetTab: skill.targetTab || (skill.category === 'forms' || (skill as any).category === 'form' ? 'agent' : 'chat'),
    createdAt,
    version: skill.version || '1.0.0',
    isBuiltIn: Boolean(skill.isBuiltIn),
  };

  const existingIdx = skills.findIndex((s) => s.id === id);
  let updatedSkills: SavedSkill[];
  if (existingIdx >= 0) {
    updatedSkills = [...skills];
    updatedSkills[existingIdx] = completeSkill;
  } else {
    updatedSkills = [completeSkill, ...skills];
  }

  await setStorageItem(STORAGE_KEYS.SAVED_SKILLS, updatedSkills);
  return completeSkill;
}

/**
 * Task 4.3: Delete a skill from chrome.storage.local by ID
 */
export async function deleteSkill(id: string): Promise<void> {
  const skills = await getSavedSkills();
  const updatedSkills = skills.filter((s) => s.id !== id);
  await setStorageItem(STORAGE_KEYS.SAVED_SKILLS, updatedSkills);
}

/**
 * Task 4.3: Reset skills catalog back to the 4 default curated skills
 */
export async function resetDefaultSkills(): Promise<SavedSkill[]> {
  await setStorageItem(STORAGE_KEYS.SAVED_SKILLS, [...DEFAULT_SAVED_SKILLS]);
  return [...DEFAULT_SAVED_SKILLS];
}

/**
 * Task 4.3: Export all saved skills as formatted JSON string
 */
export async function exportSkillsJson(): Promise<string> {
  const skills = await getSavedSkills();
  return JSON.stringify(skills, null, 2);
}

/**
 * Task 4.3: Import skills from a JSON string, validate schema, and save to storage
 */
export async function importSkillsJson(jsonString: string): Promise<SavedSkill[]> {
  try {
    const parsed = JSON.parse(jsonString);
    const rawList = Array.isArray(parsed) ? parsed : [parsed];
    if (rawList.length === 0) {
      throw new Error('Skills file contains no valid skills.');
    }

    const validatedSkills: SavedSkill[] = [];
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name || item.title || '').trim();
      const promptTemplate = String(item.promptTemplate || item.userPromptTemplate || '').trim();
      if (!name || !promptTemplate) {
        throw new Error('Imported skills must contain at least a name/title and promptTemplate.');
      }

      const id = String(item.id || `skill_imported_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      validatedSkills.push({
        id,
        name,
        title: name,
        description: String(item.description || ''),
        promptTemplate,
        category: (['study', 'writing', 'forms', 'custom', 'summary', 'reply', 'form'].includes(item.category)
          ? item.category
          : 'custom') as any,
        tags: Array.isArray(item.tags)
          ? item.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
          : typeof item.tags === 'string'
            ? item.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [],
        requiresProfile: Boolean(item.requiresProfile),
        targetTab:
          item.targetTab === 'agent' || item.category === 'forms' || item.category === 'form' ? 'agent' : 'chat',
        version: String(item.version || '1.0.0'),
        isBuiltIn: Boolean(item.isBuiltIn),
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      });
    }

    // Merge with existing skills (updating matching IDs, appending new ones)
    const existing = await getSavedSkills();
    const existingMap = new Map(existing.map((s) => [s.id, s]));
    for (const v of validatedSkills) {
      existingMap.set(v.id, v);
    }
    const merged = Array.from(existingMap.values());
    await setStorageItem(STORAGE_KEYS.SAVED_SKILLS, merged);
    return merged;
  } catch (err: any) {
    throw new Error(`Failed to import skills: ${err?.message || 'Invalid JSON format'}`);
  }
}
