/**
 * Voice STT Engine & Cloud Whisper Fallback Pipeline Tests (Tasks 5.4 & 5.5)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { SpeechRecognitionController } from '../voice/speech_recognizer';
import { AudioRecorder } from '../voice/audio_recorder';
import { WhisperClient, WhisperApiError } from '../voice/whisper_client';
import { VoiceGateway } from '../voice/voice_gateway';
import { VoiceMicButton } from '../sidepanel/components/VoiceMicButton';
import { clearAllStorage, saveSettings } from '../common/storage_adapter';

// Mock Web Audio Context
class MockAudioContext {
  currentTime = 0;
  destination = {};
  createOscillator() {
    return {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }
}

// Mock Web Speech Recognition
class MockSpeechRecognition {
  lang = 'en-US';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;

  start() {
    this.onstart?.();
  }

  stop() {
    this.onend?.();
  }

  abort() {
    this.onend?.();
  }
}

// Mock MediaStream & MediaRecorder
class MockMediaStream {
  tracks: any[] = [];
  constructor() {
    this.tracks = [
      {
        kind: 'audio',
        stop: vi.fn(),
      },
    ];
  }
  getTracks() {
    return this.tracks;
  }
}

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  static isTypeSupported(mime: string) {
    return mime.startsWith('audio/webm');
  }

  start() {
    this.state = 'recording';
    // Simulate chunk
    this.ondataavailable?.({ data: new Blob(['mock-audio-chunk'], { type: 'audio/webm' }) });
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

describe('Voice STT Pipeline Subsystem (Tasks 5.4 & 5.5)', () => {
  beforeEach(async () => {
    await clearAllStorage();

    (globalThis as any).window = globalThis;
    (globalThis as any).AudioContext = MockAudioContext;
    (globalThis as any).webkitAudioContext = MockAudioContext;
    (globalThis as any).SpeechRecognition = MockSpeechRecognition;
    (globalThis as any).MediaRecorder = MockMediaRecorder;

    if (!globalThis.navigator) {
      (globalThis as any).navigator = {};
    }

    (globalThis as any).navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
    };

    (globalThis as any).navigator.permissions = {
      query: vi.fn().mockResolvedValue({ state: 'granted' }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task 5.4: SpeechRecognitionController (Web Speech API)', () => {
    it('detects Web Speech API support', () => {
      expect(SpeechRecognitionController.isSupported()).toBe(true);
    });

    it('starts listening, triggers onStart callback, and plays start chime', () => {
      const controller = new SpeechRecognitionController({ enableChimes: true });
      const onStartSpy = vi.fn();
      controller.onStart = onStartSpy;

      const started = controller.start();
      expect(started).toBe(true);
      expect(controller.isListening).toBe(true);
      expect(onStartSpy).toHaveBeenCalled();
    });

    it('processes high-confidence final transcript (>= 0.75)', () => {
      const controller = new SpeechRecognitionController({ confidenceThreshold: 0.75 });
      const onResultSpy = vi.fn();
      controller.onResult = onResultSpy;
      controller.start();

      const mockEvent = {
        resultIndex: 0,
        results: [
          [
            {
              transcript: 'Summarize this page in Hinglish',
              confidence: 0.92,
            },
          ],
        ],
      };
      (mockEvent.results[0] as any).isFinal = true;

      // Access internal recognition instance to simulate browser event
      (controller as any).recognition.onresult(mockEvent);

      expect(onResultSpy).toHaveBeenCalledWith({
        transcript: 'Summarize this page in Hinglish',
        confidence: 0.92,
        isFinal: true,
        lowConfidence: false,
      });
    });

    it('flags low-confidence final transcript (< 0.75) for Whisper fallback', () => {
      const controller = new SpeechRecognitionController({ confidenceThreshold: 0.75 });
      const onResultSpy = vi.fn();
      controller.onResult = onResultSpy;
      controller.start();

      const mockEvent = {
        resultIndex: 0,
        results: [
          [
            {
              transcript: 'Ambiguous mumbled speech',
              confidence: 0.62,
            },
          ],
        ],
      };
      (mockEvent.results[0] as any).isFinal = true;

      (controller as any).recognition.onresult(mockEvent);

      expect(onResultSpy).toHaveBeenCalledWith({
        transcript: 'Ambiguous mumbled speech',
        confidence: 0.62,
        isFinal: true,
        lowConfidence: true,
      });
    });

    it('stops listening and triggers onEnd callback', () => {
      const controller = new SpeechRecognitionController();
      const onEndSpy = vi.fn();
      controller.onEnd = onEndSpy;

      controller.start();
      expect(controller.isListening).toBe(true);

      controller.stop();
      expect(controller.isListening).toBe(false);
      expect(onEndSpy).toHaveBeenCalled();
    });
  });

  describe('Task 5.5: AudioRecorder (Hardware Microphones)', () => {
    it('detects getUserMedia support and optimal MIME types', () => {
      expect(AudioRecorder.isSupported()).toBe(true);
      expect(AudioRecorder.getSupportedMimeType()).toBe('audio/webm;codecs=opus');
    });

    it('starts recording and captures audio stream', async () => {
      const recorder = new AudioRecorder();
      await recorder.start();

      expect(recorder.isRecording).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ audio: expect.any(Object) })
      );
    });

    it('stops recording, returns Blob, and releases all MediaStream hardware tracks', async () => {
      const recorder = new AudioRecorder();
      await recorder.start();

      const result = await recorder.stop();

      expect(recorder.isRecording).toBe(false);
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('aborts recording cleanly', async () => {
      const recorder = new AudioRecorder();
      await recorder.start();
      recorder.abort();
      expect(recorder.isRecording).toBe(false);
    });
  });

  describe('Task 5.5: WhisperClient (Groq Whisper Cloud STT)', () => {
    it('throws error if Groq API key is not configured', async () => {
      const client = new WhisperClient('');
      const mockBlob = new Blob(['audio-data'], { type: 'audio/webm' });

      await expect(client.transcribe(mockBlob)).rejects.toThrow(/Groq API key not configured/);
    });

    it('successfully calls Groq Whisper API and parses response', async () => {
      const mockBlob = new Blob(['audio-data'], { type: 'audio/webm' });
      const client = new WhisperClient('gsk_test_api_key_12345');

      const mockResponse = {
        text: 'Madadgar, find internships on LinkedIn',
        language: 'en',
        duration: 2.45,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const res = await client.transcribe(mockBlob, {
        language: 'en',
        prompt: 'Madadgar assistant voice',
      });

      expect(res.text).toBe('Madadgar, find internships on LinkedIn');
      expect(res.language).toBe('en');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer gsk_test_api_key_12345',
          },
          body: expect.any(FormData),
        })
      );
    });

    it('handles HTTP 429 rate limit errors from Groq Whisper API', async () => {
      const mockBlob = new Blob(['audio-data'], { type: 'audio/webm' });
      const client = new WhisperClient('gsk_test_key');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({ error: { message: 'Rate limit reached' } }),
      });

      try {
        await client.transcribe(mockBlob);
        expect.unreachable('Should have thrown WhisperApiError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(WhisperApiError);
        expect(err.isRateLimited).toBe(true);
        expect(err.message).toContain('Rate limit reached');
      }
    });
  });

  describe('VoiceGateway Hybrid Orchestrator & Fallback', () => {
    it('queries and checks microphone permission status', async () => {
      const gateway = new VoiceGateway();
      const status = await gateway.checkMicrophonePermission();

      expect(status.state).toBe('granted');
      expect(status.canAsk).toBe(true);
    });

    it('requests microphone permission via getUserMedia', async () => {
      const gateway = new VoiceGateway();
      const allowed = await gateway.requestMicrophonePermission();
      expect(allowed).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('orchestrates local Web Speech with high confidence without invoking Whisper', async () => {
      const gateway = new VoiceGateway();
      const onTranscriptSpy = vi.fn();
      gateway.onTranscript = onTranscriptSpy;

      await gateway.startListening();
      expect(gateway.getState()).toBe('listening');

      // Simulate local high-confidence result
      const mockResult = {
        transcript: 'Scroll down and click apply',
        confidence: 0.95,
        isFinal: true,
        lowConfidence: false,
      };
      (gateway as any).localRecognizer.onResult(mockResult);

      expect(onTranscriptSpy).toHaveBeenCalledWith({
        text: 'Scroll down and click apply',
        confidence: 0.95,
        isFinal: true,
        engine: 'local',
      });
      expect(gateway.getState()).toBe('idle');
    });

    it('falls over to Groq Whisper when local Web Speech yields low confidence', async () => {
      await saveSettings({
        geminiApiKey: 'gemini-key',
        groqApiKey: 'groq-whisper-key',
        defaultLanguage: 'en',
      });

      const gateway = new VoiceGateway({ confidenceThreshold: 0.75 });
      const onTranscriptSpy = vi.fn();
      gateway.onTranscript = onTranscriptSpy;

      // Mock Whisper API response
      (gateway as any).whisperClient.transcribe = vi.fn().mockResolvedValue({
        text: 'Clear transcribed sentence from Whisper',
        language: 'en',
      });

      await gateway.startListening();

      // Simulate low confidence from local recognizer
      const mockResult = {
        transcript: 'muffled speech',
        confidence: 0.55,
        isFinal: true,
        lowConfidence: true,
      };

      // Mock audio recorder stop returning valid blob
      (gateway as any).audioRecorder.stop = vi.fn().mockResolvedValue({
        blob: new Blob(['valid-audio-data-over-500-bytes-123456789012345678901234567890'], { type: 'audio/webm' }),
        sizeBytes: 1200,
        durationMs: 1500,
      });

      (gateway as any).localRecognizer.onResult(mockResult);

      // Allow microtask ticks for Whisper async call
      await new Promise((res) => setTimeout(res, 50));

      expect((gateway as any).whisperClient.transcribe).toHaveBeenCalled();
      expect(onTranscriptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Clear transcribed sentence from Whisper',
          engine: 'whisper',
        })
      );
    });

    it('toggles listening state and aborts gracefully', async () => {
      const gateway = new VoiceGateway();
      await gateway.toggleListening();
      expect(gateway.getState()).toBe('listening');

      gateway.abort();
      expect(gateway.getState()).toBe('idle');
    });
  });

  describe('VoiceMicButton Component (Task 5.4)', () => {
    it('creates element in idle state with keyboard shortcut tooltip', () => {
      const onToggle = vi.fn();
      const element = React.createElement(VoiceMicButton, {
        state: 'idle',
        activeEngine: 'none',
        onToggle,
      });

      expect(element).toBeDefined();
      expect(element.props.state).toBe('idle');
      expect(element.props.activeEngine).toBe('none');
    });

    it('creates element in listening and recording states with proper props', () => {
      const onToggle = vi.fn();
      const elementListening = React.createElement(VoiceMicButton, {
        state: 'listening',
        activeEngine: 'local-speech',
        onToggle,
      });
      expect(elementListening.props.state).toBe('listening');
      expect(elementListening.props.activeEngine).toBe('local-speech');

      const elementRecording = React.createElement(VoiceMicButton, {
        state: 'recording',
        activeEngine: 'cloud-whisper',
        onToggle,
      });
      expect(elementRecording.props.state).toBe('recording');
      expect(elementRecording.props.activeEngine).toBe('cloud-whisper');
    });

    it('creates element in processing and error states', () => {
      const onToggle = vi.fn();
      const elementProcessing = React.createElement(VoiceMicButton, {
        state: 'processing',
        activeEngine: 'cloud-whisper',
        onToggle,
      });
      expect(elementProcessing.props.state).toBe('processing');

      const elementError = React.createElement(VoiceMicButton, {
        state: 'error',
        errorMessage: 'Microphone permission denied',
        onToggle,
      });
      expect(elementError.props.state).toBe('error');
      expect(elementError.props.errorMessage).toBe('Microphone permission denied');
    });
  });
});
