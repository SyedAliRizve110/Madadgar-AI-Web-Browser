/**
 * Madadgar System Constants
 */

import type { UserProfileMemory, SavedSkill } from './types';

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

export const DEFAULT_USER_PROFILE: UserProfileMemory = {
  personal: {
    fullName: '',
    email: '',
    phone: '',
    location: '',
  },
  academic: {
    institution: '',
    degree: '',
    major: '',
    graduationYear: '',
  },
  professional: {
    skills: [],
    linkedInUrl: '',
    githubUrl: '',
    portfolioUrl: '',
  },
  preferences: {
    defaultLanguage: 'en',
    tone: 'formal',
  },
};

export const DEMO_USER_PROFILE: UserProfileMemory = {
  personal: {
    fullName: 'Aarav Sharma',
    email: 'aarav.sharma@example.com',
    phone: '+91 98765 43210',
    location: 'Bengaluru, Karnataka, India',
  },
  academic: {
    institution: 'National Institute of Technology',
    degree: 'Bachelor of Technology (B.Tech)',
    major: 'Computer Science & Engineering',
    graduationYear: '2025',
  },
  professional: {
    skills: ['TypeScript', 'React', 'Node.js', 'Python', 'Tailwind CSS', 'Git'],
    linkedInUrl: 'https://linkedin.com/in/aarav-sharma',
    githubUrl: 'https://github.com/aarav-sharma',
    portfolioUrl: 'https://aaravsharma.dev',
  },
  preferences: {
    defaultLanguage: 'hinglish',
    tone: 'formal',
  },
};

export const DEFAULT_SAVED_SKILLS: SavedSkill[] = [
  {
    id: 'skill-exam-notes',
    name: 'Exam Notes',
    title: 'Exam Notes',
    description: 'Generates structured revision notes with core formulas, definitions, key concepts, and exam questions from the active page.',
    category: 'study',
    tags: ['Study', 'Revision', 'Formulas', 'Student'],
    promptTemplate:
      'Analyze the current page content and generate structured, comprehensive Exam Revision Notes:\n1. Core Definitions & Formulas (with short explanations)\n2. Key Concepts & Principles (broken down simply)\n3. Top 3 High-Yield Exam Questions with ideal concise answers\n4. Rapid-Recall Mnemonics / Bullet Summary',
    targetTab: 'chat',
    isBuiltIn: true,
    version: '1.0.0',
    createdAt: 1700000000000,
  },
  {
    id: 'skill-explain-hinglish',
    name: 'Explain in Hinglish',
    title: 'Explain in Hinglish',
    description: 'Translates and breaks down complex concepts into conversational, easy-to-understand Hindi written in Roman script (Hinglish).',
    category: 'study',
    tags: ['Bilingual', 'Hinglish', 'Translation', 'Simplified'],
    promptTemplate:
      'Is page ke content ko simple aur conversational Hinglish (colloquial Hindi written in Roman script) mein samjhaiye. Daily life ke practical examples use karein, technical words English mein rakhein, aur 5 crisp points mein main concept clear karein.',
    targetTab: 'chat',
    isBuiltIn: true,
    version: '1.0.0',
    createdAt: 1700000000000,
  },
  {
    id: 'skill-reply-email-politely',
    name: 'Reply to this email politely',
    title: 'Reply to this email politely',
    description: 'Drafts a courteous, well-structured professional reply acknowledging all details with actionable next steps.',
    category: 'writing',
    tags: ['Email', 'Professional', 'Polite', 'Draft'],
    promptTemplate:
      'Based on the email/message content on this active tab, draft a polite, clear, and professional response:\n1. Warm acknowledgment & thank you\n2. Direct responses to any questions or requests\n3. Clear, proposed next steps with timeline\n4. Professional sign-off',
    targetTab: 'chat',
    isBuiltIn: true,
    version: '1.0.0',
    createdAt: 1700000000000,
  },
  {
    id: 'skill-fill-form-profile',
    name: 'Fill form from my profile',
    title: 'Fill form from my profile',
    description: 'Automatically inspects interactive form fields on the active page and proposes sequential autofill values mapped from your saved profile.',
    category: 'forms',
    tags: ['Autofill', 'Profile', 'Internship', 'HITL'],
    requiresProfile: true,
    promptTemplate:
      'Fill all interactive form inputs on this page using my local saved profile details (name, email, phone, location, college/university, degree, major, graduation year, skills, LinkedIn, GitHub, portfolio). Inspect each field, map matching profile fields, and propose each fill step for my approval.',
    targetTab: 'agent',
    isBuiltIn: true,
    version: '1.0.0',
    createdAt: 1700000000000,
  },
];

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
