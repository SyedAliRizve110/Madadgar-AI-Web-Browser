/**
 * Madadgar Bilingual Text-to-Speech (TTS) Voice Engine (Task 5.6)
 * Native browser speech synthesis with bilingual persona selection (en-US / en-IN / hi-IN),
 * playback rate controls, and Hardware Mute Latch coordination with VoiceGateway.
 */

import type { SupportedLanguage, TTSPlaybackState, TTSOptions, TTSVoiceInfo } from '@/common/types';
import type { StructuredSummary } from '@/ai/prompts/summarizer';
import type { VoiceGateway } from './voice_gateway';

export class SpeechSynthesizer {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private state: TTSPlaybackState = 'idle';
  private currentLanguage: SupportedLanguage = 'en';
  private playbackRate: number = 1.0;
  private pitch: number = 1.0;
  private volume: number = 1.0;

  private voiceGateway: VoiceGateway | null = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];

  public onStart?: () => void;
  public onEnd?: () => void;
  public onError?: (error: Error) => void;
  public onPause?: () => void;
  public onResume?: () => void;
  public onBoundary?: (charIndex: number, charLength?: number) => void;
  public onStateChange?: (state: TTSPlaybackState) => void;

  constructor(options?: { lang?: SupportedLanguage; rate?: number; gateway?: VoiceGateway }) {
    if (options?.lang) this.currentLanguage = options.lang;
    if (options?.rate) this.playbackRate = options.rate;
    if (options?.gateway) this.voiceGateway = options.gateway;

    this.initVoices();
  }

  /**
   * Safely checks whether SpeechSynthesis is supported in the current environment.
   */
  public static isSupported(): boolean {
    const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)) as any;
    return Boolean(
      g &&
      typeof g.speechSynthesis !== 'undefined' &&
      typeof g.SpeechSynthesisUtterance !== 'undefined'
    );
  }

  private getSynth(): SpeechSynthesis | null {
    const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)) as any;
    return g?.speechSynthesis ?? null;
  }

  /**
   * Loads available system voices and subscribes to voiceschanged event.
   */
  private initVoices(): void {
    const synth = this.getSynth();
    if (!synth) return;

    const loadVoices = () => {
      try {
        const voices = synth.getVoices();
        if (voices && voices.length > 0) {
          this.cachedVoices = voices;
        }
      } catch {
        // Ignore in non-browser test runner
      }
    };

    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Registers a VoiceGateway instance for automatic Hardware Mute Latch coordination.
   */
  public registerVoiceGateway(gateway: VoiceGateway | null): void {
    this.voiceGateway = gateway;
  }

  /**
   * Returns list of loaded SpeechSynthesisVoice items.
   */
  public getVoices(): TTSVoiceInfo[] {
    const synth = this.getSynth();
    const voices = synth?.getVoices() || this.cachedVoices;
    return voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      default: v.default,
      localService: v.localService,
    }));
  }

  /**
   * Selects best-matching voice for the specified language.
   * Hinglish / Hindi: selects hi-IN / en-IN Indian voice persona.
   * English: selects natural en-US / en-GB voice persona.
   */
  public selectVoice(lang: SupportedLanguage | string): SpeechSynthesisVoice | null {
    const synth = this.getSynth();
    const voices = synth?.getVoices() || this.cachedVoices;
    if (!voices || voices.length === 0) return null;

    const normalizedLang = lang.toLowerCase();
    const isHinglish = normalizedLang === 'hinglish' || normalizedLang.startsWith('hi') || normalizedLang === 'en-in';

    if (isHinglish) {
      // 1. Look for Hindi (hi-IN, hi_IN)
      const hiVoice = voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
      if (hiVoice) return hiVoice;

      // 2. Look for Indian English (en-IN)
      const inVoice = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en-in'));
      if (inVoice) return inVoice;

      // 3. Look for voice names containing India or Hindi (e.g., Google Hindi, Microsoft Heera / Neerja)
      const namedIndianVoice = voices.find((v) => {
        const name = v.name.toLowerCase();
        return name.includes('hindi') || name.includes('india') || name.includes('heera') || name.includes('neerja') || name.includes('ravi');
      });
      if (namedIndianVoice) return namedIndianVoice;
    }

    // Default / English: Look for en-US or en-GB natural voices
    const enUsVoice = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en-us') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online')));
    if (enUsVoice) return enUsVoice;

    const anyEnUsVoice = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en-us'));
    if (anyEnUsVoice) return anyEnUsVoice;

    const anyEnGbVoice = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en-gb'));
    if (anyEnGbVoice) return anyEnGbVoice;

    const anyEnVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (anyEnVoice) return anyEnVoice;

    // Fallback to default system voice
    return voices.find((v) => v.default) || voices[0] || null;
  }

  /**
   * Speaks the given text using the selected voice persona and playback settings.
   * Coordinates the Hardware Mute Latch on the VoiceGateway to prevent microphone feedback.
   */
  public async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!text || !text.trim()) return;

    const synth = this.getSynth();
    if (!synth) {
      const err = new Error('Text-to-Speech (speechSynthesis) is not available in this browser.');
      this.onError?.(err);
      throw err;
    }

    // If currently speaking or paused, cancel previous utterance
    if (this.state !== 'idle') {
      this.stop();
    }

    const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)) as any;
    const UtteranceClass = g?.SpeechSynthesisUtterance || (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null);
    if (!UtteranceClass) {
      const err = new Error('SpeechSynthesisUtterance class is missing.');
      this.onError?.(err);
      throw err;
    }

    const lang = options?.lang || this.currentLanguage;
    const rate = options?.rate ?? this.playbackRate;
    const pitch = options?.pitch ?? this.pitch;
    const volume = options?.volume ?? this.volume;

    const utterance: SpeechSynthesisUtterance = new UtteranceClass(text);
    this.currentUtterance = utterance;

    // Assign voice
    const matchedVoice = options?.voiceName
      ? (synth.getVoices() || this.cachedVoices).find((v) => v.name === options.voiceName) || this.selectVoice(lang)
      : this.selectVoice(lang);

    if (matchedVoice) {
      utterance.voice = matchedVoice;
      utterance.lang = matchedVoice.lang;
    } else {
      utterance.lang = lang === 'hinglish' ? 'hi-IN' : 'en-US';
    }

    utterance.rate = Math.max(0.5, Math.min(2.0, rate));
    utterance.pitch = Math.max(0.5, Math.min(1.5, pitch));
    utterance.volume = Math.max(0, Math.min(1.0, volume));

    return new Promise<void>((resolve, reject) => {
      utterance.onstart = () => {
        this.setState('speaking');
        // Activate Hardware Mute Latch
        this.voiceGateway?.setMuteLatch(true);
        this.onStart?.();
      };

      utterance.onend = () => {
        this.setState('idle');
        // Release Hardware Mute Latch
        this.voiceGateway?.setMuteLatch(false);
        this.currentUtterance = null;
        this.onEnd?.();
        resolve();
      };

      utterance.onerror = (event: any) => {
        // In case of intentional cancel, error is 'canceled' or 'interrupted'
        if (event?.error === 'canceled' || event?.error === 'interrupted') {
          this.setState('idle');
          this.voiceGateway?.setMuteLatch(false);
          this.currentUtterance = null;
          resolve();
          return;
        }

        const err = new Error(event?.error ? `SpeechSynthesis error: ${event.error}` : 'Speech synthesis failed');
        this.setState('idle');
        this.voiceGateway?.setMuteLatch(false);
        this.currentUtterance = null;
        this.onError?.(err);
        reject(err);
      };

      utterance.onpause = () => {
        this.setState('paused');
        this.onPause?.();
      };

      utterance.onresume = () => {
        this.setState('speaking');
        this.voiceGateway?.setMuteLatch(true);
        this.onResume?.();
      };

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        this.onBoundary?.(event.charIndex, (event as any).charLength);
      };

      try {
        synth.speak(utterance);
      } catch (err: any) {
        this.setState('idle');
        this.voiceGateway?.setMuteLatch(false);
        this.currentUtterance = null;
        this.onError?.(err);
        reject(err);
      }
    });
  }

  /**
   * Pauses active speech playback.
   */
  public pause(): void {
    const synth = this.getSynth();
    if (!synth) return;
    if (this.state === 'speaking') {
      synth.pause();
      this.setState('paused');
      // Release mute latch while paused so user can give voice commands if desired
      this.voiceGateway?.setMuteLatch(false);
    }
  }

  /**
   * Resumes paused speech playback.
   */
  public resume(): void {
    const synth = this.getSynth();
    if (!synth) return;
    if (this.state === 'paused') {
      synth.resume();
      this.setState('speaking');
      // Re-enable mute latch
      this.voiceGateway?.setMuteLatch(true);
    }
  }

  /**
   * Completely stops speech playback and releases the hardware mute latch.
   */
  public stop(): void {
    const synth = this.getSynth();
    if (synth) {
      synth.cancel();
    }
    this.currentUtterance = null;
    this.setState('idle');
    this.voiceGateway?.setMuteLatch(false);
  }

  public cancel(): void {
    this.stop();
  }

  /**
   * Sets playback rate (e.g., 1.0, 1.25, 1.5).
   */
  public setRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
  }

  public getRate(): number {
    return this.playbackRate;
  }

  /**
   * Sets default language.
   */
  public setLanguage(lang: SupportedLanguage): void {
    this.currentLanguage = lang;
  }

  public getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  public getState(): TTSPlaybackState {
    return this.state;
  }

  public getCurrentUtterance(): SpeechSynthesisUtterance | null {
    return this.currentUtterance;
  }

  private setState(newState: TTSPlaybackState): void {
    this.state = newState;
    this.onStateChange?.(newState);
  }
}

/**
 * Strips markdown and clean-formats a structured summary into natural spoken prose.
 * Supports English and Hinglish conversational phrasing.
 */
export function formatSummaryForSpeech(
  summary: StructuredSummary,
  lang: SupportedLanguage = 'en'
): string {
  if (!summary) return '';

  const cleanText = (text: string): string => {
    return text
      // Strip markdown bold / italics
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Strip markdown links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Strip chapter / timestamp brackets e.g. [02:30]
      .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, '')
      // Strip leading bullets / numbers
      .replace(/^[\s*•\-#\d.)]+/gm, '')
      // Strip backticks
      .replace(/`([^`]+)`/g, '$1')
      .trim();
  };

  const tldrClean = cleanText(summary.tldr || '');
  const highlights = (summary.keyTakeaways || []).map(cleanText).filter(Boolean);
  const actionSteps = (summary.actionableSteps || []).map(cleanText).filter(Boolean);

  if (lang === 'hinglish') {
    const parts: string[] = [];
    parts.push(`Yeh raha aapka summary. Main crux hai: ${tldrClean}`);

    if (highlights.length > 0) {
      parts.push('Zaroori baatein yeh hain:');
      const ordinalHi = ['Pehla', 'Doosra', 'Teesra', 'Chautha', 'Paanchwa'];
      highlights.slice(0, 5).forEach((h, idx) => {
        const prefix = ordinalHi[idx] || `Point ${idx + 1}`;
        parts.push(`${prefix}: ${h}`);
      });
    }

    if (actionSteps.length > 0) {
      parts.push('Agley recommended steps yeh hain:');
      actionSteps.slice(0, 3).forEach((step, idx) => {
        parts.push(`Step ${idx + 1}: ${step}`);
      });
    }

    return parts.join(' ');
  }

  // English
  const parts: string[] = [];
  parts.push(`Here is your audio summary. Key takeaway: ${tldrClean}`);

  if (highlights.length > 0) {
    parts.push('Main highlights:');
    const ordinalEn = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    highlights.slice(0, 5).forEach((h, idx) => {
      const prefix = ordinalEn[idx] || `Number ${idx + 1}`;
      parts.push(`${prefix}: ${h}`);
    });
  }

  if (actionSteps.length > 0) {
    parts.push('Recommended action steps:');
    actionSteps.slice(0, 3).forEach((step, idx) => {
      parts.push(`Step ${idx + 1}: ${step}`);
    });
  }

  return parts.join(' ');
}
