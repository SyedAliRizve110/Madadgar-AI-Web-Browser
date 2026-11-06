/**
 * Madadgar System Constants
 */

export const STORAGE_KEYS = {
  GEMINI_API_KEY: 'gemini_api_key',
  GROQ_API_KEY: 'groq_api_key',
  PREFERRED_LANGUAGE: 'preferred_language',
  SETTINGS: 'settings',
  PROFILE_MEMORY: 'profile_memory',
  SAVED_SKILLS: 'saved_skills',
  AUDIT_LOGS: 'audit_logs',
  ACTIVE_TASK_SESSION: 'active_task_session',
} as const;

export const DEFAULT_LANGUAGE = 'en';

export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
export const GEMINI_VISION_MODEL = 'gemini-2.5-flash';
export const GEMINI_LITE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
] as const;

export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export const MAX_AGENT_STEPS = 15;
