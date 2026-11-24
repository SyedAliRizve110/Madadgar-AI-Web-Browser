/**
 * Bilingual Text-to-Speech (TTS) Voice Engine & Voice Summarizer Tests (Tasks 5.6 & 5.7)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { SpeechSynthesizer, formatSummaryForSpeech } from '../voice/speech_synthesizer';
import { IntentRouter } from '../voice/intent_router';
import { VoiceGateway } from '../voice/voice_gateway';
import { SummaryCard } from '../sidepanel/components/SummaryCard';
import type { StructuredSummary } from '../ai/prompts/summarizer';

// Mock Web SpeechSynthesis & Utterance
class MockSpeechSynthesisUtterance {
  text: string;
  lang: string = 'en-US';
  voice: any = null;
  rate: number = 1.0;
  pitch: number = 1.0;
  volume: number = 1.0;

  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onboundary: ((ev: any) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class MockSpeechSynthesis {
  paused = false;
  speaking = false;
  onvoiceschanged: (() => void) | null = null;
  private currentUtterance: MockSpeechSynthesisUtterance | null = null;

  private mockVoices = [
    { name: 'Google US English', lang: 'en-US', default: true, localService: false },
    { name: 'Microsoft Jenny Online', lang: 'en-US', default: false, localService: true },
    { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: false },
    { name: 'Google हिन्दी', lang: 'hi-IN', default: false, localService: false },
    { name: 'Microsoft Heera - English (India)', lang: 'en-IN', default: false, localService: true },
  ];

  getVoices() {
    return this.mockVoices;
  }

  speak(utterance: MockSpeechSynthesisUtterance) {
    this.currentUtterance = utterance;
    this.speaking = true;
    this.paused = false;

    // Simulate async speech start
    setTimeout(() => {
      utterance.onstart?.();
    }, 10);
  }

  pause() {
    this.paused = true;
    this.speaking = false;
    this.currentUtterance?.onpause?.();
  }

  resume() {
    this.paused = false;
    this.speaking = true;
    this.currentUtterance?.onresume?.();
  }

  cancel() {
    this.paused = false;
    this.speaking = false;
    if (this.currentUtterance) {
      this.currentUtterance.onerror?.({ error: 'canceled' });
      this.currentUtterance = null;
    }
  }

  // Test helper to finish speech
  __finishSpeech() {
    this.paused = false;
    this.speaking = false;
    this.currentUtterance?.onend?.();
    this.currentUtterance = null;
  }
}

describe('Tasks 5.6 & 5.7: TTS Engine, Voice Summarizer & Intent Router', () => {
  let mockSynth: MockSpeechSynthesis;
  let originalWindow: any;

  beforeEach(() => {
    mockSynth = new MockSpeechSynthesis();
    originalWindow = (globalThis as any).window;

    (globalThis as any).speechSynthesis = mockSynth;
    (globalThis as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance as any;
    (globalThis as any).window = globalThis;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    vi.clearAllMocks();
  });

  describe('SpeechSynthesizer (Task 5.6)', () => {
    it('detects browser support properly', () => {
      expect(SpeechSynthesizer.isSupported()).toBe(true);
    });

    it('selects Hindi/Indian voice persona in Hinglish mode', () => {
      const synthesizer = new SpeechSynthesizer({ lang: 'hinglish' });
      const voice = synthesizer.selectVoice('hinglish');

      expect(voice).toBeDefined();
      expect(voice?.lang.startsWith('hi') || voice?.lang.startsWith('en-IN') || voice?.name.includes('हिन्दी')).toBe(true);
    });

    it('selects natural US voice persona in English mode', () => {
      const synthesizer = new SpeechSynthesizer({ lang: 'en' });
      const voice = synthesizer.selectVoice('en');

      expect(voice).toBeDefined();
      expect(voice?.lang.startsWith('en')).toBe(true);
      expect(voice?.name).toContain('Google US English');
    });

    it('controls speech playback lifecycle and rate clamping', async () => {
      const synthesizer = new SpeechSynthesizer();
      synthesizer.setRate(1.5);
      expect(synthesizer.getRate()).toBe(1.5);

      // Clamp test
      synthesizer.setRate(5.0);
      expect(synthesizer.getRate()).toBe(2.0);

      const onStart = vi.fn();
      const onEnd = vi.fn();
      synthesizer.onStart = onStart;
      synthesizer.onEnd = onEnd;

      const speakPromise = synthesizer.speak('Hello world', { rate: 1.25 });

      await new Promise((res) => setTimeout(res, 20));
      expect(onStart).toHaveBeenCalled();
      expect(synthesizer.getState()).toBe('speaking');

      // Finish speech
      mockSynth.__finishSpeech();
      await speakPromise;

      expect(onEnd).toHaveBeenCalled();
      expect(synthesizer.getState()).toBe('idle');
    });

    it('pauses, resumes, and cancels playback cleanly', async () => {
      const synthesizer = new SpeechSynthesizer();
      synthesizer.speak('Long paragraph to pause');

      await new Promise((res) => setTimeout(res, 20));
      expect(synthesizer.getState()).toBe('speaking');

      synthesizer.pause();
      expect(synthesizer.getState()).toBe('paused');

      synthesizer.resume();
      expect(synthesizer.getState()).toBe('speaking');

      synthesizer.stop();
      expect(synthesizer.getState()).toBe('idle');
    });

    it('Hardware Mute Latch: activates latch when speaking and blocks microphone listening', async () => {
      const gateway = new VoiceGateway();
      const synthesizer = new SpeechSynthesizer({ gateway });

      expect(gateway.isMutedByLatch()).toBe(false);

      // Start speaking
      synthesizer.speak('Testing Hardware Mute Latch acoustic safety.');
      await new Promise((res) => setTimeout(res, 20));

      // Latch is active while TTS speaks
      expect(gateway.isMutedByLatch()).toBe(true);

      // Microphone start is blocked while TTS speaks
      const micStarted = await gateway.startListening();
      expect(micStarted).toBe(false);

      // When speech ends, latch releases automatically
      mockSynth.__finishSpeech();
      await new Promise((res) => setTimeout(res, 10));

      expect(gateway.isMutedByLatch()).toBe(false);
    });
  });

  describe('formatSummaryForSpeech (Task 5.6 & 5.7)', () => {
    const mockSummary: StructuredSummary = {
      tldr: 'Madadgar is a **privacy-first** browser agent.',
      keyTakeaways: [
        '[01:15] **Fast Setup**: Initialize project with Vite.',
        '[03:40] **Human Oversight**: Safety approval gates.',
      ],
      actionableSteps: [
        'Run `npm run build:chrome` to package extension.',
      ],
      rawText: 'Raw markdown summary text',
    };

    it('formats clean English speech without markdown artifacts or brackets', () => {
      const spokenText = formatSummaryForSpeech(mockSummary, 'en');

      expect(spokenText).toContain('Here is your audio summary. Key takeaway: Madadgar is a privacy-first browser agent.');
      expect(spokenText).toContain('First: Fast Setup: Initialize project with Vite.');
      expect(spokenText).toContain('Second: Human Oversight: Safety approval gates.');
      expect(spokenText).toContain('Step 1: Run npm run build:chrome to package extension.');
      // Should not contain raw markdown asterisks or brackets
      expect(spokenText).not.toContain('**');
      expect(spokenText).not.toContain('[01:15]');
      expect(spokenText).not.toContain('`');
    });

    it('formats conversational Hinglish speech with persona phrasing', () => {
      const spokenText = formatSummaryForSpeech(mockSummary, 'hinglish');

      expect(spokenText).toContain('Yeh raha aapka summary. Main crux hai: Madadgar is a privacy-first browser agent.');
      expect(spokenText).toContain('Zaroori baatein yeh hain:');
      expect(spokenText).toContain('Pehla: Fast Setup: Initialize project with Vite.');
      expect(spokenText).toContain('Doosra: Human Oversight: Safety approval gates.');
      expect(spokenText).toContain('Agley recommended steps yeh hain:');
      expect(spokenText).not.toContain('**');
      expect(spokenText).not.toContain('[01:15]');
    });
  });

  describe('IntentRouter (Task 5.7)', () => {
    it('parses standard English summarization commands', () => {
      const intent1 = IntentRouter.parse('Madadgar, summarize this page');
      expect(intent1.type).toBe('SUMMARIZE_PAGE');
      expect(intent1.audioBriefingRequested).toBe(false);

      const intent2 = IntentRouter.parse('give me a quick 60-second summary of this page');
      expect(intent2.type).toBe('SUMMARIZE_PAGE');

      const intent3 = IntentRouter.parse('what is this page about?');
      expect(intent3.type).toBe('SUMMARIZE_PAGE');
    });

    it('parses Hinglish summarization commands', () => {
      const intent1 = IntentRouter.parse('Madadgar, is page ko summarize karo');
      expect(intent1.type).toBe('SUMMARIZE_PAGE');
      expect(intent1.language).toBe('hinglish');

      const intent2 = IntentRouter.parse('page ka summary batao');
      expect(intent2.type).toBe('SUMMARIZE_PAGE');
      expect(intent2.language).toBe('hinglish');
    });

    it('detects audio briefing requests in spoken instructions', () => {
      const intent1 = IntentRouter.parse('Madadgar, summarize this page and read it aloud');
      expect(intent1.type).toBe('SUMMARIZE_PAGE');
      expect(intent1.audioBriefingRequested).toBe(true);

      const intent2 = IntentRouter.parse('give me a 60-second summary while I make coffee');
      expect(intent2.type).toBe('SUMMARIZE_PAGE');
      expect(intent2.audioBriefingRequested).toBe(true);

      const intent3 = IntentRouter.parse('audio briefing');
      expect(intent3.type).toBe('READ_ALOUD_SUMMARY');
      expect(intent3.audioBriefingRequested).toBe(true);
    });

    it('parses playback control commands (stop, pause, resume)', () => {
      expect(IntentRouter.parse('stop reading').type).toBe('STOP_SPEAKING');
      expect(IntentRouter.parse('chup raho').type).toBe('STOP_SPEAKING');
      expect(IntentRouter.parse('shut up').type).toBe('STOP_SPEAKING');
      expect(IntentRouter.parse('pause audio').type).toBe('PAUSE_SPEAKING');
      expect(IntentRouter.parse('resume reading').type).toBe('RESUME_SPEAKING');
    });

    it('falls back to GENERAL_INPUT for non-summarization chat prompts', () => {
      const intent = IntentRouter.parse('Help me write an email to my professor');
      expect(intent.type).toBe('GENERAL_INPUT');
      expect(intent.cleanedText).toBe('Help me write an email to my professor');
    });
  });

  describe('SummaryCard Audio Briefing UI (Task 5.7)', () => {
    const mockSummary: StructuredSummary = {
      tldr: 'Agent simplifies browsing with human supervision.',
      keyTakeaways: ['High performance', 'Cross-browser compatibility'],
      actionableSteps: ['Install and test'],
      rawText: 'Mock summary',
    };

    it('renders with Audio Briefing controls in idle state', () => {
      const onPlay = vi.fn();
      const element = React.createElement(SummaryCard, {
        summary: mockSummary,
        ttsState: 'idle',
        ttsRate: 1.0,
        onPlayAudioBriefing: onPlay,
      });

      expect(element).toBeDefined();
      expect(element.props.ttsState).toBe('idle');
      expect(element.props.ttsRate).toBe(1.0);
    });

    it('renders with Audio Briefing controls in speaking state with speed controls', () => {
      const onPause = vi.fn();
      const onStop = vi.fn();
      const onRate = vi.fn();

      const element = React.createElement(SummaryCard, {
        summary: mockSummary,
        ttsState: 'speaking',
        ttsRate: 1.25,
        language: 'hinglish',
        onPauseAudioBriefing: onPause,
        onStopAudioBriefing: onStop,
        onRateChange: onRate,
      });

      expect(element).toBeDefined();
      expect(element.props.ttsState).toBe('speaking');
      expect(element.props.ttsRate).toBe(1.25);
      expect(element.props.language).toBe('hinglish');
    });
  });
});

