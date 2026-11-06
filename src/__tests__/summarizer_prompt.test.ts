import { describe, it, expect } from 'vitest';
import {
  buildArticleSummaryPrompt,
  buildYouTubeSummaryPrompt,
  parseSummary,
} from '@/ai/prompts/summarizer';

describe('Summarizer Prompts', () => {
  it('builds English article summary prompt with metadata', () => {
    const { systemInstruction, userPrompt } = buildArticleSummaryPrompt('Sample article text content.', {
      title: 'AI Innovations in 2026',
      author: 'Jane Doe',
      language: 'en',
    });

    expect(systemInstruction).toContain('### 📌 TL;DR');
    expect(systemInstruction).toContain('### 💡 5 Key Takeaways');
    expect(systemInstruction).toContain('### 🚀 Actionable Next Steps');
    expect(systemInstruction).toContain('EXACTLY 5 key takeaways');

    expect(userPrompt).toContain('Title: "AI Innovations in 2026"');
    expect(userPrompt).toContain('Author: Jane Doe');
    expect(userPrompt).toContain('Sample article text content.');
  });

  it('builds Hinglish article summary prompt with Roman-script instructions', () => {
    const { systemInstruction, userPrompt } = buildArticleSummaryPrompt('Article text.', {
      language: 'hinglish',
    });

    expect(systemInstruction).toContain('colloquial, conversational Hindi written in Roman script');
    expect(systemInstruction).toContain('Hinglish');
    expect(userPrompt).toContain('Article text.');
  });

  it('builds YouTube summary prompt with timestamp instructions', () => {
    const { systemInstruction, userPrompt } = buildYouTubeSummaryPrompt('[00:15] Introduction\n[02:30] Main topic', {
      title: 'Vite Tutorial',
      language: 'en',
    });

    expect(systemInstruction).toContain('YouTube Transcript Rule');
    expect(userPrompt).toContain('Vite Tutorial');
    expect(userPrompt).toContain('[00:15]');
  });

  it('parses structured summary output accurately into sections', () => {
    const mockOutput = `
### 📌 TL;DR
Chrome extensions built with Manifest V3 provide high security and performance when paired with modern Vite tooling.

### 💡 5 Key Takeaways
1. Manifest V3 replaces background pages with short-lived service workers.
2. CRXJS enables fast HMR during development.
3. Declarative Net Request reduces permissions overhead.
4. Local storage ensures user credentials stay strictly on-device.
5. React 18 in side panel allows smooth UI interactions.

### 🚀 Actionable Next Steps
- Clone the repository and run npm install.
- Load the dist folder into chrome://extensions.
- Configure your Gemini API key in settings.
`;

    const parsed = parseSummary(mockOutput);

    expect(parsed.tldr).toBe(
      'Chrome extensions built with Manifest V3 provide high security and performance when paired with modern Vite tooling.'
    );
    expect(parsed.keyTakeaways).toHaveLength(5);
    expect(parsed.keyTakeaways[0]).toContain('Manifest V3 replaces background pages');
    expect(parsed.keyTakeaways[4]).toContain('React 18 in side panel');

    expect(parsed.actionableSteps).toHaveLength(3);
    expect(parsed.actionableSteps[0]).toBe('Clone the repository and run npm install.');
  });
});

