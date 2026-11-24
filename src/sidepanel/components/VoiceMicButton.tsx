/**
 * Madadgar Voice Microphone Button Component (Task 5.4)
 * Visual pulsating microphone toggle with keyboard shortcut (Alt+V),
 * audio activity indicators, and multi-engine state feedback (Local STT & Whisper Fallback).
 */

import React from 'react';
import { Mic, Loader2, AlertCircle } from 'lucide-react';
import type { VoiceInputState, VoiceEngineType } from '@/common/types';
import { VoiceGateway } from '@/voice/voice_gateway';

export interface VoiceMicButtonProps {
  state: VoiceInputState;
  activeEngine?: VoiceEngineType;
  errorMessage?: string | null;
  onToggle: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({
  state,
  activeEngine = 'none',
  errorMessage,
  onToggle,
  className = '',
  size = 'md',
}) => {
  const isListening = state === 'listening' || state === 'recording';
  const isProcessing = state === 'processing';
  const isError = state === 'error';

  const sizeClasses = {
    sm: 'w-7 h-7 p-1 text-xs',
    md: 'w-8 h-8 p-1.5 text-sm',
    lg: 'w-10 h-10 p-2 text-base',
  }[size];

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  // Tooltip description
  let tooltip = 'Voice Input (Alt+V)';
  if (isListening) {
    tooltip = activeEngine === 'cloud-whisper'
      ? 'Recording audio for Whisper... Click to stop (Alt+V)'
      : 'Listening... Click to finish (Alt+V)';
  } else if (isProcessing) {
    tooltip = 'Transcribing with Groq Whisper...';
  } else if (isError) {
    tooltip = errorMessage || 'Microphone error. Click to retry.';
  }

  const handleClick = () => {
    if (isError && (errorMessage?.toLowerCase().includes('permission') || errorMessage?.toLowerCase().includes('access'))) {
      VoiceGateway.openPermissionTab();
      return;
    }
    onToggle();
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} title={tooltip}>
      {/* Pulsating Ripple Rings when actively listening / recording */}
      {isListening && (
        <>
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
          <span className="absolute -inset-1 rounded-full bg-red-500/20 animate-pulse pointer-events-none" />
        </>
      )}

      <button
        type="button"
        onClick={handleClick}
        aria-label={tooltip}
        aria-pressed={isListening}
        disabled={isProcessing}
        className={`relative z-10 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 select-none ${sizeClasses} ${
          isListening
            ? 'bg-red-600 text-white shadow-md shadow-red-500/30 hover:bg-red-700 focus:ring-red-400'
            : isProcessing
              ? 'bg-indigo-100 text-indigo-700 focus:ring-indigo-300'
              : isError
                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 focus:ring-amber-400 border border-amber-300'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 focus:ring-slate-400'
        }`}
      >
        {isProcessing ? (
          <Loader2 className={`${iconSizes} animate-spin text-indigo-600`} />
        ) : isListening ? (
          <Mic className={`${iconSizes} animate-bounce`} />
        ) : isError ? (
          <AlertCircle className={`${iconSizes} text-amber-700`} />
        ) : (
          <Mic className={iconSizes} />
        )}
      </button>

      {/* Engine Indicator Badge */}
      {isListening && (
        <span
          className="absolute -bottom-1 -right-1 px-1 py-0.2 text-[8px] font-bold rounded bg-slate-900 text-white shadow-xs pointer-events-none"
          title={activeEngine === 'cloud-whisper' ? 'Groq Whisper' : 'Web Speech'}
        >
          {activeEngine === 'cloud-whisper' ? 'W' : 'STT'}
        </span>
      )}
    </div>
  );
};
