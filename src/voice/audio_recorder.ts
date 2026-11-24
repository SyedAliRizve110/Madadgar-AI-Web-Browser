/**
 * Madadgar Audio Recorder (Task 5.5)
 * Captures microphone audio using navigator.mediaDevices.getUserMedia and MediaRecorder.
 * Buffers audio chunks and prepares multipart Blobs for Groq Whisper STT fallback.
 * Strictly local hardware management: releases all media tracks immediately upon stop.
 */

export interface AudioRecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private startTime = 0;
  private isRecordingInternal = false;

  /**
   * Checks whether getUserMedia and MediaRecorder are available.
   */
  public static isSupported(): boolean {
    const nav = typeof navigator !== 'undefined' ? navigator : (typeof globalThis !== 'undefined' ? (globalThis as any).navigator : undefined);
    const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)) as any;
    if (!nav?.mediaDevices) return false;
    return typeof nav.mediaDevices.getUserMedia === 'function' && typeof g?.MediaRecorder !== 'undefined';
  }

  /**
   * Discovers the best audio MIME type supported by the host browser.
   */
  public static getSupportedMimeType(): string {
    const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)) as any;
    if (!g || typeof g.MediaRecorder === 'undefined' || typeof g.MediaRecorder.isTypeSupported !== 'function') {
      return 'audio/webm';
    }

    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];

    for (const mime of preferredTypes) {
      if (g.MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }

    return '';
  }

  /**
   * Starts capturing microphone audio.
   */
  public async start(): Promise<void> {
    if (this.isRecordingInternal) {
      return;
    }

    if (!AudioRecorder.isSupported()) {
      throw new Error('Audio recording (getUserMedia/MediaRecorder) is not supported in this environment.');
    }

    this.recordedChunks = [];

    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const mimeType = AudioRecorder.getSupportedMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

    const g = (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : undefined)) as any;
    const MediaRecorderClass = g?.MediaRecorder || (typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined);
    if (!MediaRecorderClass) {
      throw new Error('MediaRecorder class is not available.');
    }

    const recorder: MediaRecorder = new MediaRecorderClass(this.mediaStream, options);
    this.mediaRecorder = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.startTime = Date.now();
    this.isRecordingInternal = true;
    recorder.start(100); // 100ms slice interval
  }

  /**
   * Stops recording, shuts down media tracks, and returns audio Blob.
   */
  public async stop(): Promise<AudioRecordingResult> {
    if (!this.isRecordingInternal || !this.mediaRecorder) {
      throw new Error('Audio recorder is not currently recording.');
    }

    const durationMs = Date.now() - this.startTime;

    return new Promise<AudioRecordingResult>((resolve, reject) => {
      this.mediaRecorder!.onstop = () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || AudioRecorder.getSupportedMimeType() || 'audio/webm';
          const blob = new Blob(this.recordedChunks, { type: mimeType });

          // Release all microphone hardware tracks immediately
          this.cleanupTracks();
          this.isRecordingInternal = false;
          this.mediaRecorder = null;

          resolve({
            blob,
            mimeType,
            durationMs,
            sizeBytes: blob.size,
          });
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder!.onerror = (event: any) => {
        this.cleanupTracks();
        this.isRecordingInternal = false;
        reject(new Error(`MediaRecorder error: ${event?.error?.message || 'Unknown recording error'}`));
      };

      try {
        this.mediaRecorder!.stop();
      } catch (stopErr) {
        this.cleanupTracks();
        this.isRecordingInternal = false;
        reject(stopErr);
      }
    });
  }

  /**
   * Instantly aborts recording and releases audio hardware tracks.
   */
  public abort(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanupTracks();
    this.recordedChunks = [];
    this.isRecordingInternal = false;
    this.mediaRecorder = null;
  }

  /**
   * Shuts down all active MediaStream tracks to turn off the microphone hardware light.
   */
  private cleanupTracks(): void {
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => {
          track.stop();
        });
      } catch {
        // ignore
      }
      this.mediaStream = null;
    }
  }

  public get isRecording(): boolean {
    return this.isRecordingInternal;
  }

  public get isSupported(): boolean {
    return AudioRecorder.isSupported();
  }
}
