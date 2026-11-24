/**
 * Madadgar Web Speech API STT Engine (Task 5.4)
 * High-speed, zero-cost, on-device speech-to-text controller.
 * Features confidence threshold filtering (>= 0.75), 5-second silence auto-timeout,
 * and built-in Web Audio API chimes for start/stop/error indications.
 */

// Global type augmentation for Web Speech API across browsers
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface SpeechRecognitionResultPayload {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  lowConfidence: boolean;
}

export interface SpeechRecognizerOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  confidenceThreshold?: number;
  silenceTimeoutMs?: number;
  enableChimes?: boolean;
}

export class SpeechRecognitionController {
  private recognition: any | null = null;
  private isListeningInternal = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private confidenceThreshold: number;
  private silenceTimeoutMs: number;
  private enableChimes: boolean;
  private currentLanguage: string;

  public onStart?: () => void;
  public onEnd?: () => void;
  public onError?: (error: Error | { error: string; message?: string }) => void;
  public onResult?: (result: SpeechRecognitionResultPayload) => void;

  constructor(options: SpeechRecognizerOptions = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.75;
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 5000;
    this.enableChimes = options.enableChimes ?? true;
    this.currentLanguage = options.lang || 'en-US';

    this.initRecognition(options);
  }

  /**
   * Checks if Web Speech API is supported in current browser runtime.
   */
  public static isSupported(): boolean {
    const g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? (globalThis as any) : undefined);
    if (!g) return false;
    return !!(g.SpeechRecognition || g.webkitSpeechRecognition);
  }

  /**
   * Initializes or re-initializes underlying browser SpeechRecognition instance.
   */
  private initRecognition(options: SpeechRecognizerOptions = {}): void {
    if (!SpeechRecognitionController.isSupported()) {
      return;
    }

    const g = (typeof window !== 'undefined' ? window : globalThis) as any;
    const SpeechRecognitionClass = g.SpeechRecognition || g.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionClass();

    this.recognition.lang = this.currentLanguage;
    this.recognition.continuous = options.continuous ?? false;
    this.recognition.interimResults = options.interimResults ?? true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListeningInternal = true;
      if (this.enableChimes) {
        this.playChime('start');
      }
      this.resetSilenceTimer();
      this.onStart?.();
    };

    this.recognition.onend = () => {
      this.isListeningInternal = false;
      this.clearSilenceTimer();
      if (this.enableChimes) {
        this.playChime('stop');
      }
      this.onEnd?.();
    };

    this.recognition.onerror = (event: any) => {
      this.isListeningInternal = false;
      this.clearSilenceTimer();
      if (event.error !== 'aborted' && this.enableChimes) {
        this.playChime('error');
      }
      const err = new Error(`Speech recognition error: ${event.error || 'unknown'}`);
      (err as any).errorType = event.error;
      this.onError?.(err);
    };

    this.recognition.onspeechstart = () => {
      this.resetSilenceTimer();
    };

    this.recognition.onspeechend = () => {
      this.resetSilenceTimer();
    };

    this.recognition.onresult = (event: any) => {
      this.resetSilenceTimer();

      let interimTranscript = '';
      let finalTranscript = '';
      let highestConfidence = 0.8; // Default optimistic fallback if browser omits confidence

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const alternative = item[0];
        const text = alternative?.transcript || '';
        const conf = typeof alternative?.confidence === 'number' && alternative.confidence > 0
          ? alternative.confidence
          : 0.85;

        if (item.isFinal) {
          finalTranscript += text;
          highestConfidence = conf;
        } else {
          interimTranscript += text;
          highestConfidence = Math.max(highestConfidence, conf);
        }
      }

      const activeText = finalTranscript.trim() || interimTranscript.trim();
      if (!activeText) return;

      const isFinal = finalTranscript.trim().length > 0;
      const lowConfidence = isFinal && highestConfidence < this.confidenceThreshold;

      this.onResult?.({
        transcript: activeText,
        confidence: Number(highestConfidence.toFixed(2)),
        isFinal,
        lowConfidence,
      });

      // If final result achieved in non-continuous mode, stop listening
      if (isFinal && !this.recognition?.continuous) {
        this.stop();
      }
    };
  }

  /**
   * Resets the 5-second silence auto-timeout timer.
   */
  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    if (this.silenceTimeoutMs > 0 && this.isListeningInternal) {
      this.silenceTimer = setTimeout(() => {
        if (this.isListeningInternal) {
          console.log('[SpeechRecognizer] 5-second silence auto-timeout triggered.');
          this.stop();
        }
      }, this.silenceTimeoutMs);
    }
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Plays a synthesized audio chime via Web Audio API.
   * Completely local and zero external sound asset dependencies.
   */
  public playChime(type: 'start' | 'stop' | 'error'): void {
    try {
      const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)) as any;
      if (!g) return;
      const AudioCtx = g.AudioContext || g.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      if (type === 'start') {
        // High, upbeat ascending tone (C5 -> E5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'stop') {
        // Gentle descending tone (E5 -> C5)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.12);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'error') {
        // Low double-blip error alert (240Hz -> 180Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.setValueAtTime(180, now + 0.08);

        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // AudioContext unavailable or autoplay blocked
    }
  }

  /**
   * Sets recognition language ('en-US', 'en-IN', 'hi-IN').
   */
  public setLanguage(lang: string): void {
    this.currentLanguage = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  /**
   * Starts speech recognition listening.
   */
  public start(options?: { lang?: string }): boolean {
    if (!this.recognition) {
      this.initRecognition();
      if (!this.recognition) {
        this.onError?.(new Error('Web Speech API is not supported in this browser.'));
        return false;
      }
    }

    if (this.isListeningInternal) {
      return true;
    }

    if (options?.lang) {
      this.setLanguage(options.lang);
    }

    try {
      this.recognition.start();
      return true;
    } catch (err: any) {
      // Handle already started or busy state gracefully
      console.warn('[SpeechRecognizer] Failed to start recognition:', err.message);
      this.onError?.(err);
      return false;
    }
  }

  /**
   * Gracefully stops speech recognition and waits for final transcript.
   */
  public stop(): void {
    this.clearSilenceTimer();
    if (this.recognition && this.isListeningInternal) {
      try {
        this.recognition.stop();
      } catch {
        // ignore already stopped
      }
    }
    this.isListeningInternal = false;
  }

  /**
   * Instantly aborts speech recognition without processing remaining audio.
   */
  public abort(): void {
    this.clearSilenceTimer();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
    }
    this.isListeningInternal = false;
  }

  public get isListening(): boolean {
    return this.isListeningInternal;
  }

  public get isSupported(): boolean {
    return SpeechRecognitionController.isSupported();
  }
}
