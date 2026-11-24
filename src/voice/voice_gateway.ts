/**
 * Madadgar Voice Gateway (Tasks 5.4 & 5.5)
 * Central coordinator orchestrating low-latency local Web Speech STT,
 * seamless Groq Whisper cloud fallback, and microphone hardware permission management.
 */

import { SpeechRecognitionController, type SpeechRecognitionResultPayload } from './speech_recognizer';
import { AudioRecorder } from './audio_recorder';
import { WhisperClient } from './whisper_client';
import type {
  VoiceInputState,
  VoiceEngineType,
  VoiceTranscriptResult,
  VoicePermissionStatus,
} from '@/common/types';
import { getSettings } from '@/common/storage_adapter';

export interface VoiceGatewayOptions {
  lang?: string;
  confidenceThreshold?: number;
  silenceTimeoutMs?: number;
  enableChimes?: boolean;
  whisperPrompt?: string;
}

export class VoiceGateway {
  private localRecognizer: SpeechRecognitionController | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private whisperClient: WhisperClient;

  private state: VoiceInputState = 'idle';
  private activeEngine: VoiceEngineType = 'none';
  private isMuteLatched: boolean = false;

  private confidenceThreshold: number;
  private silenceTimeoutMs: number;
  private enableChimes: boolean;
  private currentLanguage: string;
  private whisperPrompt?: string;

  public onStateChange?: (state: VoiceInputState, details?: { engine?: VoiceEngineType; error?: string }) => void;
  public onTranscript?: (result: VoiceTranscriptResult) => void;
  public onError?: (error: Error) => void;

  constructor(options: VoiceGatewayOptions = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.75;
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 5000;
    this.enableChimes = options.enableChimes ?? true;
    this.currentLanguage = options.lang || 'en-US';
    this.whisperPrompt = options.whisperPrompt || 'Madadgar assistant voice command with English and Hinglish terms';

    this.whisperClient = new WhisperClient();
    this.initEngines();
  }

  private initEngines(): void {
    if (SpeechRecognitionController.isSupported()) {
      this.localRecognizer = new SpeechRecognitionController({
        lang: this.currentLanguage,
        confidenceThreshold: this.confidenceThreshold,
        silenceTimeoutMs: this.silenceTimeoutMs,
        enableChimes: this.enableChimes,
      });

      this.localRecognizer.onStart = () => {
        this.setState('listening', 'local-speech');
      };

      this.localRecognizer.onEnd = () => {
        if (this.state === 'listening') {
          this.setState('idle', 'none');
        }
      };

      this.localRecognizer.onError = (err: any) => {
        console.warn('[VoiceGateway] Local speech recognizer reported error:', err);
        const errType = String(err?.errorType || err?.message || '');
        if (errType.includes('not-allowed') || errType.includes('permission')) {
          const permErr = new Error('Microphone access is not permitted in the Side Panel. Click to grant permission.');
          this.setState('error', 'none', permErr.message);
          this.onError?.(permErr);
          return;
        }
        // Fall back to Whisper if audio buffer is available
        this.attemptWhisperFallback('Local Web Speech error: ' + (err.message || 'unknown'));
      };

      this.localRecognizer.onResult = (result: SpeechRecognitionResultPayload) => {
        if (result.isFinal) {
          if (result.lowConfidence) {
            console.log(`[VoiceGateway] Local STT confidence (${result.confidence}) is below threshold (${this.confidenceThreshold}). Failing over to Groq Whisper...`);
            this.attemptWhisperFallback('Low confidence local transcription');
          } else {
            // High confidence result: abort audio recording and return immediately
            this.abortAudioRecording();
            this.setState('idle', 'none');
            this.onTranscript?.({
              text: result.transcript,
              confidence: result.confidence,
              isFinal: true,
              engine: 'local',
            });
          }
        } else {
          // Stream interim results
          this.onTranscript?.({
            text: result.transcript,
            confidence: result.confidence,
            isFinal: false,
            engine: 'local',
          });
        }
      };
    }

    if (AudioRecorder.isSupported()) {
      this.audioRecorder = new AudioRecorder();
    }
  }

  /**
   * Checks microphone permission status and generates explanatory user instructions.
   */
  public async checkMicrophonePermission(): Promise<VoicePermissionStatus> {
    const nav = typeof navigator !== 'undefined' ? navigator : (typeof globalThis !== 'undefined' ? (globalThis as any).navigator : undefined);
    if (!nav?.mediaDevices?.getUserMedia) {
      return {
        state: 'unsupported',
        canAsk: false,
        instructions: 'Microphone access is not supported by your browser engine.',
      };
    }

    if (nav.permissions?.query) {
      try {
        const status = await nav.permissions.query({ name: 'microphone' as PermissionName });
        const canAsk = status.state !== 'denied';
        const instructions = status.state === 'denied'
          ? 'Microphone access is blocked. Please allow microphone permissions in chrome://settings/content/microphone or your browser address bar.'
          : undefined;

        return {
          state: status.state as any,
          canAsk,
          instructions,
        };
      } catch {
        // Fall through to standard test
      }
    }

    return {
      state: 'prompt',
      canAsk: true,
    };
  }

  /**
   * Prompts user for microphone permission.
   */
  public async requestMicrophonePermission(): Promise<boolean> {
    const nav = typeof navigator !== 'undefined' ? navigator : (typeof globalThis !== 'undefined' ? (globalThis as any).navigator : undefined);
    if (!nav?.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await nav.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t: any) => t.stop());
      return true;
    } catch (err: any) {
      console.warn('[VoiceGateway] Microphone permission denied:', err.message);
      return false;
    }
  }

  /**
   * Sets or releases the hardware mute latch (Task 5.6).
   * When TTS is speaking, the latch is activated to prevent acoustic feedback loops.
   */
  public setMuteLatch(latched: boolean): void {
    this.isMuteLatched = latched;
    if (latched) {
      if (this.state === 'listening' || this.state === 'recording') {
        console.log('[VoiceGateway] Hardware Mute Latch active: Aborting active voice capture to prevent acoustic feedback loop.');
        this.abort();
      }
    }
  }

  /**
   * Checks whether the microphone is currently latched/muted due to TTS output.
   */
  public isMutedByLatch(): boolean {
    return this.isMuteLatched;
  }

  /**
   * Starts listening. Orchestrates local Web Speech with concurrent audio buffering.
   */
  public async startListening(options?: { lang?: string }): Promise<boolean> {
    if (this.isMuteLatched) {
      console.warn('[VoiceGateway] Cannot start listening: Hardware Mute Latch is active (TTS audio playback in progress).');
      return false;
    }

    if (this.state === 'listening' || this.state === 'recording' || this.state === 'processing') {
      return true;
    }

    if (options?.lang) {
      this.currentLanguage = options.lang;
      this.localRecognizer?.setLanguage(options.lang);
    }

    // 1. Check microphone permission first
    const perm = await this.checkMicrophonePermission();
    if (perm.state === 'denied') {
      const err = new Error(perm.instructions || 'Microphone access is denied in browser settings.');
      this.setState('error', 'none', err.message);
      this.onError?.(err);
      return false;
    }

    // 2. Start audio recording buffer for fallback
    if (this.audioRecorder) {
      try {
        await this.audioRecorder.start();
      } catch (recErr: any) {
        console.warn('[VoiceGateway] AudioRecorder failed to initialize:', recErr.message);
      }
    }

    // 3. If local Web Speech is supported, start it
    if (this.localRecognizer?.isSupported) {
      const started = this.localRecognizer.start({ lang: this.currentLanguage });
      if (started) {
        this.setState('listening', 'local-speech');
        return true;
      }
    }

    // 4. If local Web Speech is unsupported (e.g. Firefox), use pure Whisper flow
    if (this.audioRecorder?.isRecording) {
      this.setState('recording', 'cloud-whisper');
      return true;
    }

    const unsuppErr = new Error('No voice speech engine is supported in this browser.');
    this.setState('error', 'none', unsuppErr.message);
    this.onError?.(unsuppErr);
    return false;
  }

  /**
   * Stops listening and completes transcription.
   */
  public async stopListening(): Promise<void> {
    if (this.state === 'idle') return;

    // If pure whisper recording was active
    if (this.state === 'recording' && this.audioRecorder?.isRecording) {
      await this.processWhisperRecording();
      return;
    }

    // Stop local recognizer
    if (this.localRecognizer?.isListening) {
      this.localRecognizer.stop();
    }
  }

  /**
   * Instantly cancels listening and discards all buffers.
   */
  public abort(): void {
    if (this.localRecognizer) {
      this.localRecognizer.abort();
    }
    this.abortAudioRecording();
    this.setState('idle', 'none');
  }

  /**
   * Opens the dedicated permission prompt tab to grant microphone access for the extension origin.
   */
  public static openPermissionTab(): void {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/index.html?request_mic=true') });
    } else if (typeof window !== 'undefined') {
      window.open(window.location.origin + window.location.pathname + '?request_mic=true', '_blank');
    }
  }

  /**
   * Toggles listening on or off.
   */
  public async toggleListening(): Promise<void> {
    if (this.state === 'error') {
      this.setState('idle', 'none');
    }
    if (this.state === 'listening' || this.state === 'recording' || this.state === 'processing') {
      await this.stopListening();
    } else {
      await this.startListening();
    }
  }

  /**
   * Attempts cloud Whisper fallback using buffered audio.
   */
  private async attemptWhisperFallback(reason: string): Promise<void> {
    console.log(`[VoiceGateway] Falling over to Groq Whisper: ${reason}`);

    if (!this.audioRecorder || !this.audioRecorder.isRecording) {
      if (reason.toLowerCase().includes('not-allowed') || reason.toLowerCase().includes('permission')) {
        this.setState('error', 'none', 'Microphone permission denied.');
        this.onError?.(new Error('Microphone permission denied.'));
      } else {
        this.setState('idle', 'none');
      }
      return;
    }

    await this.processWhisperRecording();
  }

  /**
   * Processes the recorded audio blob through Groq Whisper.
   */
  private async processWhisperRecording(): Promise<void> {
    this.setState('processing', 'cloud-whisper');

    try {
      if (!this.audioRecorder || !this.audioRecorder.isRecording) {
        throw new Error('No audio recording stream active.');
      }

      const audioResult = await this.audioRecorder.stop();
      if (audioResult.sizeBytes < 500) {
        // Less than 500 bytes is essentially empty/silence
        this.setState('idle', 'none');
        return;
      }

      const settings = await getSettings();
      const whisperLang = this.currentLanguage.startsWith('hi') ? 'hi' : 'en';

      const response = await this.whisperClient.transcribe(audioResult.blob, {
        apiKey: settings.groqApiKey,
        language: whisperLang,
        prompt: this.whisperPrompt,
      });

      if (response.text && response.text.trim()) {
        this.onTranscript?.({
          text: response.text.trim(),
          confidence: 0.95,
          isFinal: true,
          engine: 'whisper',
        });
      }

      this.setState('idle', 'none');
    } catch (err: any) {
      console.warn('[VoiceGateway] Whisper fallback failed:', err.message);
      this.setState('error', 'none', err.message);
      this.onError?.(err);
    }
  }

  private abortAudioRecording(): void {
    if (this.audioRecorder) {
      this.audioRecorder.abort();
    }
  }

  private setState(newState: VoiceInputState, engine: VoiceEngineType, errorMsg?: string): void {
    this.state = newState;
    this.activeEngine = engine;
    this.onStateChange?.(newState, { engine, error: errorMsg });
  }

  public getState(): VoiceInputState {
    return this.state;
  }

  public getActiveEngine(): VoiceEngineType {
    return this.activeEngine;
  }
}
