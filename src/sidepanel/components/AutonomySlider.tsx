/**
 * Madadgar - Tiered Autonomy Mode Slider / Selector (Task 6.2)
 * Allows users to toggle between Co-Pilot (Manual HITL) and Supervised Auto-Pilot.
 */

import React from 'react';
import { ShieldCheck, Zap, Info } from 'lucide-react';
import type { AutonomyMode } from '@/common/types';

export interface AutonomySliderProps {
  mode: AutonomyMode;
  onChange: (mode: AutonomyMode) => void;
  disabled?: boolean;
  className?: string;
}

export const AutonomySlider: React.FC<AutonomySliderProps> = ({
  mode,
  onChange,
  disabled = false,
  className = '',
}) => {
  const isAuto = mode === 'auto-pilot';

  return (
    <div className={`p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-800">Autonomy Tier</span>
          <span
            className="text-[10px] text-slate-400 cursor-help"
            title="Co-Pilot prompts for every step. Auto-Pilot executes safe actions (risk < 0.5) hands-free while pausing for consequential or financial buttons."
          >
            <Info className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Segmented Mode Control */}
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('co-pilot')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              !isAuto
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Co-Pilot</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('auto-pilot')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isAuto
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Auto-Pilot</span>
          </button>
        </div>
      </div>

      {/* Mode Description Subtext */}
      <div className="text-[11px] leading-relaxed">
        {!isAuto ? (
          <p className="text-slate-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span>
              <strong>Manual HITL:</strong> Evaluates step proposals and requires your click confirmation on every action.
            </span>
          </p>
        ) : (
          <p className="text-amber-800 bg-amber-50/70 p-1.5 rounded-lg border border-amber-200/60 flex items-start gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Supervised Auto-Pilot:</strong> Hands-free for low-risk actions (<span className="font-mono">risk &lt; 0.5</span>). Consequential buttons (Pay, Delete, Place Order) pause for confirmation.
            </span>
          </p>
        )}
      </div>
    </div>
  );
};
