/**
 * Madadgar Grounded Page QA Prompts
 * Ensures strict grounding in the active page's extracted content.
 * Enforces rejection of queries outside the page text.
 * Supports English and conversational Hinglish.
 */

import type { SupportedLanguage, PageContext, ChatMessage } from '@/common/types';
import type { GeminiContent } from '../gemini_client';

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

/**
 * Builds the system instruction including the formatted page context
 */
export function buildGroundedSystemInstruction(
  context: PageContext,
  language: SupportedLanguage = 'en'
): string {
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

