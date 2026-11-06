/**
 * Madadgar Grounded Page QA & LLM Chat Prompts
 * - Grounded Mode: Strict grounding in active page content; rejects outside queries.
 * - LLM Mode (Task 4.4+): Direct connection to full-capability LLM. Answers any query
 *   (general knowledge, coding, explanations beyond page) while retaining page context & selections.
 * - Supports English and conversational Hinglish.
 */

import type { SupportedLanguage, PageContext, ChatMessage } from '@/common/types';
import type { GeminiContent } from '../gemini_client';
import { isBlacklistedDomain, SAFETY_BLOCKED_DOMAIN_MESSAGE } from '@/safety/domain_rules';

export type ChatMode = 'grounded' | 'llm';

export const GROUNDED_QA_SYSTEM_PROMPTS = {
  en: `You are Madadgar, an expert browser AI assistant grounded strictly in the current webpage context provided below.

CRITICAL GROUNDING RULES:
1. Answer questions STRICTLY and EXCLUSIVELY based on the provided page context.
2. If the user's query asks for information that is NOT mentioned or directly inferable from the page context, you MUST explicitly state:
"This information is not present on the current page."
Do NOT invent external facts, assume outside details, or bring in outside knowledge.
3. If the user asks about a specific section or topic that exists on the page, quote or cite the relevant part directly.
4. If a user highlighted or selected specific text on the page, prioritize answering in relation to that selected excerpt.
5. Format your response cleanly using Markdown (bullet points, bold text, code blocks where appropriate).
6. Be concise, direct, and factual.`,

  hinglish: `You are Madadgar, an expert bilingual browser assistant grounded strictly in the current webpage context provided below.

CRITICAL GROUNDING RULES:
1. Aapko diye gaye webpage context ke aadhar par hi sawaal ka jawaab dena hai.
2. Agar poochhi gayi information page par maujood NAHI hai, to saaf shabdon me kahein:
"This information is not present on the current page." (Ya "Yeh information is page par maujood nahi hai.")
Text ke bahar ki koi fabricated baatein na likhein.
3. Conversational, colloquial Hinglish me baat karein (Hindi written in Roman script, naturally blended with English technical terminology).
4. Agar user ne page par koi specific text select kiya hai, to us context ko dhyan me rakhkar jawaab dein.
5. Saaf Markdown formatting use karein (bullet points, bold text).
6. Direct aur accurate rahein.`
};

export const LLM_CHAT_SYSTEM_PROMPTS = {
  en: `You are Madadgar, an intelligent browser AI assistant connected directly to a full-capability Large Language Model (LLM).

GENERAL INTELLIGENCE & FLEXIBILITY:
1. You can answer ANY question the user asks—whether it directly relates to the current page or is completely external/general knowledge (e.g. general explanations, science, coding, math, history, everyday questions, translations, creative writing).
2. If webpage context is provided below, seamlessly use it to inform your answer whenever the question pertains to the page or references it.
3. If the user's question asks for information NOT present on the page or is unrelated to the page, DO NOT refuse or say it is missing. Instead, use your full LLM intelligence and general knowledge to provide an insightful, accurate, and comprehensive answer!
4. If the user highlighted or selected specific text on the page, prioritize answering in relation to that selected excerpt while drawing upon outside knowledge where helpful.
5. Format your response cleanly using Markdown (bullet points, bold text, code blocks where appropriate).
6. Be concise, direct, helpful, and polite.`,

  hinglish: `You are Madadgar, an intelligent bilingual browser AI assistant connected directly to a full-capability Large Language Model (LLM).

GENERAL INTELLIGENCE & FLEXIBILITY:
1. Aapke paas full general knowledge aur webpage context dono ka access hai. User kisi bhi topic par sawaal pooch sakta hai.
2. Agar sawaal current page se related hai, toh page context aur selected text ka use karke badhiya aur accurate jawaab dein.
3. Agar poochhi gayi information page par maujood NAHI hai ya sawaal page se bilkul alag hai (general knowledge, coding, explanations), toh sawaal reject mat karein. Apni full general intelligence se pura, helpful aur accurate jawaab dein!
4. Conversational, colloquial Hinglish me baat karein (Hindi written in Roman script, naturally blended with English technical terminology).
5. Agar user ne koi specific text select kiya hai, toh us context ko dhyan me rakhkar jawaab dein.
6. Saaf Markdown formatting use karein (bullet points, bold text, code blocks).
7. Direct, helpful aur accurate rahein.`
};

/**
 * Builds the system instruction based on the active chat mode (Grounded vs. LLM)
 */
export function buildChatSystemInstruction(
  context?: PageContext | null,
  language: SupportedLanguage = 'en',
  mode: ChatMode = 'grounded'
): string {
  // If the active URL is a blacklisted financial/banking portal, never inject its context
  if (context?.url && isBlacklistedDomain(context.url)) {
    if (mode === 'llm') {
      const base = LLM_CHAT_SYSTEM_PROMPTS[language] || LLM_CHAT_SYSTEM_PROMPTS.en;
      return `${base}\n\n[SECURITY NOTICE: Active tab is on a protected financial/banking domain. Page context is strictly excluded for user security.]`;
    }
    return `You are Madadgar.\nSECURITY POLICY: ${SAFETY_BLOCKED_DOMAIN_MESSAGE}\nStrictly refuse interaction with this page context.`;
  }

  if (mode === 'llm') {
    const baseInstruction = LLM_CHAT_SYSTEM_PROMPTS[language] || LLM_CHAT_SYSTEM_PROMPTS.en;
    if (!context || (!context.textContent && !context.selection && !context.title)) {
      return baseInstruction;
    }

    const metaLines: string[] = [];
    if (context.title) metaLines.push(`Page Title: "${context.title}"`);
    if (context.url) metaLines.push(`Page URL: ${context.url}`);
    if (context.byline) metaLines.push(`Author/Source: ${context.byline}`);
    if (context.isYouTube) metaLines.push(`Content Type: YouTube Video Transcript`);
    if (context.selection) metaLines.push(`Currently Selected Text: "${context.selection}"`);

    const pageBody = (context.textContent || '').trim();

    return `${baseInstruction}

====================
CURRENT WEBPAGE CONTEXT (AVAILABLE FOR REFERENCE):
${metaLines.join('\n')}

PAGE TEXT CONTENT:
"""
${pageBody || 'No text content available on this page.'}
"""
====================`;
  }

  // Fallback to strict grounded prompt
  return buildGroundedSystemInstruction(
    context || { tabId: -1, title: '', url: '', textContent: '', length: 0 },
    language
  );
}

/**
 * Builds the system instruction including the formatted page context (Strict Grounded Mode)
 */
export function buildGroundedSystemInstruction(
  context: PageContext,
  language: SupportedLanguage = 'en'
): string {
  if (context.url && isBlacklistedDomain(context.url)) {
    return `You are Madadgar.\nSECURITY POLICY: ${SAFETY_BLOCKED_DOMAIN_MESSAGE}\nStrictly refuse interaction with this page context.`;
  }

  const baseInstruction = GROUNDED_QA_SYSTEM_PROMPTS[language] || GROUNDED_QA_SYSTEM_PROMPTS.en;

  const metaLines: string[] = [];
  if (context.title) metaLines.push(`Page Title: "${context.title}"`);
  if (context.url) metaLines.push(`Page URL: ${context.url}`);
  if (context.byline) metaLines.push(`Author/Source: ${context.byline}`);
  if (context.isYouTube) metaLines.push(`Content Type: YouTube Video Transcript`);
  if (context.selection) metaLines.push(`Currently Selected Text: "${context.selection}"`);

  const pageBody = (context.textContent || '').trim();

  return `${baseInstruction}

====================
CURRENT WEBPAGE CONTEXT:
${metaLines.join('\n')}

PAGE TEXT CONTENT:
"""
${pageBody || 'No text content available on this page.'}
"""
====================`;
}

/**
 * Builds multi-turn GeminiContent array for chat requests
 */
export function buildGroundedChatContents(
  userQuery: string,
  history: ChatMessage[] = [],
  context?: PageContext
): GeminiContent[] {
  const contents: GeminiContent[] = [];

  // Add conversation history
  for (const msg of history) {
    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    } else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }],
      });
    }
  }

  // Include current selection hint in user query if present and not already mentioned
  let activeQuery = userQuery.trim();
  if (context?.selection && !activeQuery.includes(context.selection)) {
    if (/this|selected|highlighted|quote/i.test(activeQuery)) {
      activeQuery = `[Context regarding selected text: "${context.selection}"]\n\n${activeQuery}`;
    }
  }

  // Add the current user message
  contents.push({
    role: 'user',
    parts: [{ text: activeQuery }],
  });

  return contents;
}

