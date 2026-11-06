/**
 * Madadgar Summarizer Prompt Templates & Parser
 * Enforces structured 3-part summaries:
 * 1. One-line TL;DR
 * 2. 5 Key Takeaways
 * 3. Actionable Next Steps
 * Supports English and Hinglish (colloquial Roman-script Hindi + English terms).
 */

import type { SupportedLanguage } from '@/common/types';

export interface SummaryPromptOptions {
  title?: string;
  url?: string;
  author?: string;
  language?: SupportedLanguage;
}

export interface StructuredSummary {
  tldr: string;
  keyTakeaways: string[];
  actionableSteps: string[];
  rawText: string;
}

export const SUMMARIZER_SYSTEM_PROMPTS = {
  en: `You are Madadgar, an expert reading assistant. Your task is to analyze the provided article or text and generate a concise, high-value structured summary.

CRITICAL INSTRUCTIONS:
You MUST format your output strictly into the following three sections using exact Markdown headers:

### 📌 TL;DR
[A single, crisp, high-impact one-sentence summary capturing the core premise.]

### 💡 5 Key Takeaways
1. [First crucial takeaway or insight]
2. [Second crucial takeaway with supporting evidence or data]
3. [Third crucial takeaway highlighting key reasoning]
4. [Fourth crucial takeaway explaining context or nuance]
5. [Fifth crucial takeaway on outcome or conclusion]

### 🚀 Actionable Next Steps
- [Concrete action item or takeaway for the reader]
- [Next step, relevant tool, or application to explore]
- [Key decision point or critical follow-up]

RULES:
- Provide EXACTLY 5 key takeaways.
- Keep the TL;DR to ONE sentence only.
- Write in clear, professional English.
- Ground your summary strictly in the provided text. Do not hallucinate external facts.`,

  hinglish: `You are Madadgar, an expert bilingual reading assistant. Your task is to analyze the provided article or text and generate a conversational structured summary in colloquial Hinglish (Hindi written in Roman script, naturally blended with English technical terminology).

CRITICAL INSTRUCTIONS:
Explain in colloquial, conversational Hindi written in Roman script (Hinglish), mixing natural Hindi phrasing with English technical terms.
You MUST format your output strictly into the following three sections using exact Markdown headers:

### 📌 TL;DR
[Sirf ek crisp aur clear line me poore article ka core essence ya mukhya baat.]

### 💡 5 Key Takeaways
1. [Pehli sabse important point ya learning]
2. [Doosra zaroori takeaway context ya logic ke saath]
3. [Teesra key point jo article highlight karta hai]
4. [Chautha important detail ya fact]
5. [Paanchva conclusion ya main takeaway]

### 🚀 Actionable Next Steps
- [Aapko aage kya karna chahiye ya dhyan me rakhna chahiye]
- [Practical application ya next action item]
- [Follow-up step ya practice point]

RULES:
- Exactly 5 key takeaways hone chahiye.
- TL;DR sirf EK single sentence me ho.
- Tone friendly, relatable aur natural Hinglish me ho (e.g., "Yeh article explain karta hai ki...", "Dhyan dene wali baat yeh hai...").
- Text ke bahar ki koi fabricated baatein na likhein.`
};

/**
 * Builds the user prompt for standard articles or web pages
 */
export function buildArticleSummaryPrompt(
  text: string,
  options?: SummaryPromptOptions
): { systemInstruction: string; userPrompt: string } {
  const lang: SupportedLanguage = options?.language === 'hinglish' ? 'hinglish' : 'en';
  const systemInstruction = SUMMARIZER_SYSTEM_PROMPTS[lang];

  const metaParts: string[] = [];
  if (options?.title) metaParts.push(`Title: "${options.title}"`);
  if (options?.author) metaParts.push(`Author: ${options.author}`);
  if (options?.url) metaParts.push(`Source URL: ${options.url}`);

  const metadataHeader = metaParts.length > 0 ? `METADATA:\n${metaParts.join('\n')}\n\n` : '';

  const userPrompt = `${metadataHeader}ARTICLE CONTENT TO SUMMARIZE:
"""
${text.trim()}
"""

Please provide the structured summary following the 3 required sections strictly.`;

  return { systemInstruction, userPrompt };
}

export const YOUTUBE_SUMMARIZER_SYSTEM_PROMPTS = {
  en: `You are Madadgar, an expert video reading assistant. Your task is to analyze the provided YouTube video transcript and generate a structured chapter-style summary with timestamped highlights.

CRITICAL INSTRUCTIONS:
You MUST format your output strictly into the following three sections using exact Markdown headers:

### 📌 TL;DR
[A single, crisp, high-impact one-sentence summary capturing the core premise of the video.]

### 💡 5 Key Takeaways
1. [mm:ss] **[Chapter / Topic Name]**: [Concise explanation of this section's core takeaway]
2. [mm:ss] **[Chapter / Topic Name]**: [Concise explanation of this section's core takeaway]
3. [mm:ss] **[Chapter / Topic Name]**: [Concise explanation of this section's core takeaway]
4. [mm:ss] **[Chapter / Topic Name]**: [Concise explanation of this section's core takeaway]
5. [mm:ss] **[Chapter / Topic Name]**: [Concise explanation of this section's core takeaway]

### 🚀 Actionable Next Steps
- [Concrete action item or takeaway for the viewer]
- [Next step, relevant tool, or technique to explore]
- [Key decision point or follow-up practice]

RULES:
- YouTube Transcript Rule: Always cite the relevant timestamp [mm:ss] at the beginning of each of the 5 takeaways.
- Provide EXACTLY 5 key takeaways.
- Keep the TL;DR to ONE sentence only.
- Write in clear, professional English.
- Ground your summary strictly in the provided transcript. Do not hallucinate external facts.`,

  hinglish: `You are Madadgar, an expert bilingual video assistant. Your task is to analyze the provided YouTube transcript and generate a chapter-style structured summary in colloquial Hinglish (Hindi written in Roman script, naturally blended with English technical terminology).

CRITICAL INSTRUCTIONS:
Explain in colloquial, conversational Hindi written in Roman script (Hinglish), mixing natural Hindi phrasing with English technical terms.
You MUST format your output strictly into the following three sections using exact Markdown headers:

### 📌 TL;DR
[Sirf ek crisp aur clear line me poore video ka core essence ya mukhya message.]

### 💡 5 Key Takeaways
1. [mm:ss] **[Chapter / Topic Name]**: [Pehla zaroori point timestamp ke saath explain karein]
2. [mm:ss] **[Chapter / Topic Name]**: [Doosra key topic explanation ke saath]
3. [mm:ss] **[Chapter / Topic Name]**: [Teesra takeaway aur uski details]
4. [mm:ss] **[Chapter / Topic Name]**: [Chautha important learning point]
5. [mm:ss] **[Chapter / Topic Name]**: [Paanchva conclusion ya final takeaway]

### 🚀 Actionable Next Steps
- [Aapko aage kya karna chahiye ya try karna chahiye]
- [Practical application ya next action item]
- [Follow-up step ya resource jo explore karni hai]

RULES:
- Har ek key takeaway ke shuru me timestamp [mm:ss] zaroor likhein.
- Exactly 5 key takeaways hone chahiye.
- TL;DR sirf EK single sentence me ho.
- Tone friendly, relatable aur natural Hinglish me ho.`
};

/**
 * Builds the user prompt for YouTube transcripts or video metadata fallback
 */
export function buildYouTubeSummaryPrompt(
  transcript: string,
  options?: SummaryPromptOptions & {
    videoId?: string;
    hasTranscript?: boolean;
    channelTitle?: string;
    description?: string;
  }
): { systemInstruction: string; userPrompt: string } {
  const lang: SupportedLanguage = options?.language === 'hinglish' ? 'hinglish' : 'en';
  const hasCaptions = options?.hasTranscript !== false && transcript.trim().length > 0;

  let systemInstruction = YOUTUBE_SUMMARIZER_SYSTEM_PROMPTS[lang];

  if (!hasCaptions) {
    // Edge-case 5.2: Captions are disabled on this video
    const fallbackNotice = lang === 'hinglish'
      ? `\n\nNOTE: Is video me captions/transcripts disabled hain. Creator ke description aur metadata ke aadhar par structured overview provide karein.`
      : `\n\nNOTE: Captions are disabled on this video. Provide an overview based on the creator's description and metadata.`;

    systemInstruction = SUMMARIZER_SYSTEM_PROMPTS[lang] + fallbackNotice;
  }

  const metaParts: string[] = [];
  if (options?.title) metaParts.push(`Video Title: "${options.title}"`);
  if (options?.channelTitle || options?.author) metaParts.push(`Channel: ${options?.channelTitle || options?.author}`);
  if (options?.videoId) metaParts.push(`Video ID: ${options.videoId}`);
  if (options?.url) metaParts.push(`Video URL: ${options.url}`);

  const metadataHeader = metaParts.length > 0 ? `METADATA:\n${metaParts.join('\n')}\n\n` : '';

  let contentBody = '';
  if (hasCaptions) {
    contentBody = `TIMESTAMPED TRANSCRIPT:
"""
${transcript.trim()}
"""`;
  } else {
    contentBody = `VIDEO DESCRIPTION & METADATA (Captions Disabled):
"""
${(options?.description || transcript || 'No description provided.').trim()}
"""`;
  }

  const userPrompt = `${metadataHeader}${contentBody}

Please provide the structured chapter summary following the 3 required sections strictly.`;

  return { systemInstruction, userPrompt };
}


/**
 * Parses raw LLM Markdown output into structured object for UI rendering
 */
export function parseSummary(rawMarkdown: string): StructuredSummary {
  const clean = rawMarkdown.trim();

  let tldr = '';
  const keyTakeaways: string[] = [];
  const actionableSteps: string[] = [];

  // Match TL;DR section
  const tldrMatch = clean.match(/###?\s*📌?\s*TL;?DR[:\s]*\n+([\s\S]*?)(?=\n+###?|\n*$)/i);
  if (tldrMatch) {
    tldr = tldrMatch[1].trim().replace(/^\[|\]$/g, '').trim();
  }

  // Match 5 Key Takeaways section
  const takeawaysMatch = clean.match(/###?\s*💡?\s*5?\s*Key Takeaways[:\s]*\n+([\s\S]*?)(?=\n+###?|\n*$)/i);
  if (takeawaysMatch) {
    const rawTakeaways = takeawaysMatch[1].trim();
    const lines = rawTakeaways.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      const point = trimmedLine.replace(/^\d+[\.\)]\s*|^[-*•]\s*/, '').trim();
      if (point.length > 0) {
        keyTakeaways.push(point);
      }
    }
  }

  // Match Actionable Next Steps section
  const nextStepsMatch = clean.match(/###?\s*🚀?\s*Actionable (?:Next Steps|Items)[:\s]*\n+([\s\S]*?)(?=\n+###?|\n*$)/i);
  if (nextStepsMatch) {
    const rawSteps = nextStepsMatch[1].trim();
    const lines = rawSteps.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      const item = trimmedLine.replace(/^[-*•]\s*|^\d+[\.\)]\s*/, '').trim();
      if (item.length > 0) {
        actionableSteps.push(item);
      }
    }
  }

  return {
    tldr,
    keyTakeaways,
    actionableSteps,
    rawText: clean,
  };
}

