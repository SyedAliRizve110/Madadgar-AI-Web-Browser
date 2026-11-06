import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Settings, X, Zap } from 'lucide-react';
import {
  AIGateway,
  type RateLimitStatus,
  type FailoverEvent,
} from '@/ai/ai_gateway';

export interface RateLimitBannerProps {
  onOpenSettings?: () => void;
}

export const RateLimitBanner: React.FC<RateLimitBannerProps> = ({ onOpenSettings }) => {
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [failoverNotice, setFailoverNotice] = useState<FailoverEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Subscribe to AIGateway rate limit status
  useEffect(() => {
    const unsubscribeRateLimit = AIGateway.subscribeRateLimit((status) => {
      setRateLimitStatus(status);
      if (status) {
        setIsDismissed(false);
        const rem = Math.max(0, Math.ceil((status.expiresAt - Date.now()) / 1000));
        setRemainingSeconds(rem);
      } else {
        setRemainingSeconds(0);
      }
    });

    // Subscribe to failover events
    const unsubscribeFailover = AIGateway.subscribeFailover((event) => {
      setFailoverNotice(event);
      // Auto-hide failover banner after 8 seconds
      const timer = setTimeout(() => {
        setFailoverNotice(null);
      }, 8000);
      return () => clearTimeout(timer);
    });

    return () => {
      unsubscribeRateLimit();
      unsubscribeFailover();
    };
  }, []);

  // Ticking countdown timer
  useEffect(() => {
    if (!rateLimitStatus || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      const rem = Math.max(0, Math.ceil((rateLimitStatus.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(rem);

      if (rem <= 0) {
        AIGateway.clearRateLimitStatus();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimitStatus, remainingSeconds]);

  // Format seconds to mm:ss
  const formatTimer = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <>
      {/* 1. Transient Failover Notice (Gemini -> Groq) */}
      {failoverNotice && (
        <div className="mx-3 mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs flex items-center justify-between shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Zap className="w-3 h-3 fill-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[11px] truncate">
                Failover Active: Groq Llama 3.3
              </p>
              <p className="text-[10px] text-amber-700 truncate">
                Gemini quota exhausted. Switched seamlessly to Groq free tier.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFailoverNotice(null)}
            className="p-1 text-amber-600 hover:text-amber-800 rounded transition-colors shrink-0 cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Non-blocking Rate Limit Cooldown Banner with Live Countdown Timer */}
      {rateLimitStatus && !isDismissed && remainingSeconds > 0 && (
        <div className="mx-3 mt-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-xs shadow-2xs animate-fade-in space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-rose-900">
                  Free-Tier Cooldown Active
                </h4>
                <p className="text-[11px] text-rose-700 leading-tight">
                  {rateLimitStatus.message ||
                    'All providers reached rate limits. Waiting for quota cooldown.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="p-1 text-rose-400 hover:text-rose-700 rounded transition-colors shrink-0 cursor-pointer"
              title="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-rose-200/60">
            {/* Countdown Badge */}
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-rose-200 text-rose-700 font-mono text-[11px] font-semibold">
              <Clock className="w-3 h-3 text-rose-500 animate-spin" />
              <span>Retry in: {formatTimer(remainingSeconds)}</span>
            </div>

            {/* Quick Settings Action */}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-800 hover:text-rose-950 underline cursor-pointer"
              >
                <Settings className="w-3 h-3" />
                <span>Configure Groq Key</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

