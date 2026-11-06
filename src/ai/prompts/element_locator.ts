/**
 * Madadgar - "Find It For Me" Natural Language Element Locator Prompts (Task 3.4)
 * Generates structured prompts for locating specific interactive elements on a webpage
 * given an arbitrary user intent query (e.g., "Where do I upload my resume?", "Where is pricing?").
 */

import type { SupportedLanguage, ElementLocatorResult } from '@/common/types';

export interface ElementLocatorPromptResult {
  systemInstruction: string;
  userPrompt: string;
}

/**
 * Builds the system instruction and user prompt for locating an interactive element
 */
export function buildElementLocatorPrompt(
  query: string,
  actionMap: string,
  language: SupportedLanguage = 'en'
): ElementLocatorPromptResult {
  const isHinglish = language === 'hinglish';

  const systemInstruction = isHinglish
    ? `Aap Madadgar ke Element Locator Engine hain. User ke sawal aur webpage ke numbered Action Map ko analyze karein. User ki query ke hisaab se sahi interactive element ka numeric target_id pehchanein.
Aapko strictly valid JSON format mein output dena hai:
{
  "target_id": <numeric_id_or_null>,
  "reason": "<clear_one_sentence_explanation_in_Hinglish>",
  "confidence": "high" | "medium" | "low"
}
Agar page par query se related koi element nahi milta, toh target_id ko null rakhein.`
    : `You are Madadgar's Element Locator Engine. Given a user search query and a numbered Action Map of interactive elements on the current webpage, identify the single most relevant element numeric target_id that fulfills the user's intent (e.g. "Where do I upload my resume?", "Where is the login button?").

Respond STRICTLY with a valid JSON object adhering to this schema:
{
  "target_id": <numeric_id_or_null>,
  "reason": "<clear_one_sentence_explanation_in_English>",
  "confidence": "high" | "medium" | "low"
}
Rules:
1. "target_id" must be an integer matching one of the #<id> badges from the Action Map, or null if no element matches.
2. "reason" must be a concise, direct explanation of why this element was selected.
3. "confidence" must be "high", "medium", or "low".
4. Do not include markdown code block backticks if possible, return raw JSON only.`;

  const userPrompt = `User Query: "${query.trim()}"

Numbered Webpage Action Map:
${actionMap}

Identify the target element matching the user's query:`;

  return { systemInstruction, userPrompt };
}

/**
 * Robust JSON parser for LLM element locator responses
 */
export function parseElementLocatorResponse(rawResponse: string): ElementLocatorResult {
  if (!rawResponse || !rawResponse.trim()) {
    return {
      targetId: null,
      reason: 'Empty response received from AI model.',
      confidence: 'low',
    };
  }

  // 1. Strip markdown code fence blocks if model wrapped it in ```json ... ```
  let cleanJson = rawResponse.trim();
  const fenceMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    cleanJson = fenceMatch[1].trim();
  } else {
    // Or locate the first '{' and last '}'
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(cleanJson);
    const targetId =
      typeof parsed.target_id === 'number'
        ? parsed.target_id
        : typeof parsed.targetId === 'number'
        ? parsed.targetId
        : null;

    const reason =
      typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim()
        : targetId !== null
        ? `Located element #${targetId} matching your request.`
        : 'Could not find a matching element on this page.';

    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'medium';

    return {
      targetId,
      reason,
      confidence,
    };
  } catch (err) {
    console.warn('[parseElementLocatorResponse] JSON parse failed, falling back to regex:', err);

    // Fallback regex pattern matching: "target_id": 4
    const idMatch = rawResponse.match(/["']?target_?id["']?\s*:\s*(\d+|null)/i);
    const reasonMatch = rawResponse.match(/["']?reason["']?\s*:\s*["']([^"']+)["']/i);

    let targetId: number | null = null;
    if (idMatch && idMatch[1] !== 'null') {
      targetId = parseInt(idMatch[1], 10);
    }

    const reason = reasonMatch
      ? reasonMatch[1]
      : targetId !== null
      ? `Located element #${targetId}`
      : 'Could not find a matching element on this page.';

    return {
      targetId,
      reason,
      confidence: targetId !== null ? 'medium' : 'low',
    };
  }
}

