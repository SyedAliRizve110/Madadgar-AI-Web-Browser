/**
 * Madadgar Local Storage Adapter
 * Strongly-typed async wrapper around chrome.storage.local.
 * Provides fallback store for testing and browser preview environments.
 * Strictly local-only: Zero network calls or external telemetry.
 */

import { STORAGE_KEYS, DEFAULT_LANGUAGE, DEFAULT_USER_PROFILE, DEMO_USER_PROFILE, DEFAULT_SAVED_SKILLS } from './constants';
import type { AppSettings, StorageSchema, SupportedLanguage, AgentTaskSession, AuditLogEntry, UserProfileMemory, SavedSkill } from './types';

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
