import React, { useState } from 'react';
import {
  Check,
  SkipForward,
  OctagonX,
  AlertTriangle,
  Sparkles,
  Eye,
  MousePointer,
  Keyboard,
  ListFilter,
  ArrowUpDown,
  CheckCircle,
  ShieldAlert,
} from 'lucide-react';
import type { AgentActionProposal, AgentActionType } from '@/common/types';

export interface ActionCardProps {
  step: number;
  maxSteps: number;
  proposal: AgentActionProposal;
  dryRun?: boolean;
  onToggleDryRun?: (enabled: boolean) => void;
  onApprove: () => void;
  onSkip: () => void;
  onStop: () => void;
  isExecuting?: boolean;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  step,
  maxSteps,
  proposal,
  dryRun = false,
  onToggleDryRun,
  onApprove,
  onSkip,
  onStop,
  isExecuting = false,
}) => {
  const { action, target_id, value, reason, is_consequential } = proposal;
  const progressPercent = Math.min(100, Math.round((step / maxSteps) * 100));

  // Elevated Double-Confirmation State for Consequential Actions (Task 4.4.3)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  const handleApproveClick = () => {
    if (is_consequential) {
      setShowConfirmModal(true);
      return;
    }
    onApprove();
  };

  const handleElevatedConfirm = () => {
    setShowConfirmModal(false);
    setConfirmCheckbox(false);
    onApprove();
  };

  const renderActionBadge = (act: AgentActionType) => {
    switch (act) {
      case 'click':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <MousePointer className="w-3 h-3" />
            <span>Click</span>
          </span>
        );
      case 'type':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Keyboard className="w-3 h-3" />
            <span>Type Text</span>
          </span>
        );
      case 'select':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <ListFilter className="w-3 h-3" />
            <span>Select Option</span>
          </span>
        );
      case 'scroll':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <ArrowUpDown className="w-3 h-3" />
            <span>Scroll Page</span>
          </span>
        );
      case 'done':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <CheckCircle className="w-3 h-3" />
            <span>Complete Task</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
            {act}
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden transition-all animate-fadeIn">
      {/* 1. Header & Step Progress */}
      <div className="p-3.5 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-white border-b border-slate-200/80">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 bg-indigo-100/80 px-2 py-0.5 rounded-md">
              {`Step ${step} of ${maxSteps}`}
            </span>
            {renderActionBadge(action)}
          </div>

          {/* Dry Run Badge / Indicator */}
          {dryRun && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
              <Eye className="w-3 h-3 text-amber-600" />
              <span>Dry-Run Active</span>
            </span>
          )}
        </div>

        {/* Linear progress bar */}
        <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 2. Proposal Body */}
      <div className="p-4 space-y-3.5">
        {/* Target Element Box */}
        {target_id !== undefined && target_id !== null && (
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
              {`#${target_id}`}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Target Element
              </p>
              <p className="text-xs font-medium text-slate-800 truncate">
                Highlighted with glowing outline on active tab
              </p>
            </div>
          </div>
        )}

        {/* Input Value Preview if typing or selecting */}
        {value !== undefined && value !== null && value !== '' && (
          <div className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100/80 text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-800 block mb-1">
              {action === 'type' ? 'Value to Enter:' : action === 'select' ? 'Option to Select:' : 'Direction:'}
            </span>
            <div className="font-mono text-xs text-slate-900 bg-white p-2 rounded-lg border border-indigo-100 break-all select-text">
              {value}
            </div>
          </div>
        )}

        {/* AI Reasoning */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>AI Reasoning:</span>
          </div>
          <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 leading-relaxed italic">
            {`"${reason}"`}
          </p>
        </div>

        {/* Consequential Action Alert */}
        {is_consequential && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2 text-xs animate-pulse">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-[11px]">Consequential Action Warning</p>
              <p className="text-[11px] leading-snug text-amber-800">
                This step will submit a form, alter saved data, or trigger a significant transaction. Please review the highlighted element carefully before approving.
              </p>
            </div>
          </div>
        )}

        {/* Dry-Run Mode Toggle */}
        {onToggleDryRun && (
          <div className="pt-1 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100">
            <label
              htmlFor="dry-run-checkbox"
              className="flex items-center gap-1.5 cursor-pointer select-none text-[11px]"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>Dry-run mode (highlight without executing)</span>
            </label>
            <input
              id="dry-run-checkbox"
              type="checkbox"
              checked={dryRun}
              onChange={(e) => onToggleDryRun(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* 3. Action Decision Buttons */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center gap-2">
        {/* Approve Button */}
        <button
          type="button"
          onClick={handleApproveClick}
          disabled={isExecuting}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
            is_consequential
              ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
              : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
          }`}
          title={
            is_consequential
              ? 'Elevated confirmation required for consequential step'
              : 'Approve and execute this single action'
          }
        >
          {isExecuting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Executing...</span>
            </>
          ) : is_consequential ? (
            <>
              <ShieldAlert className="w-4 h-4 stroke-[2.5]" />
              <span>Review & Approve</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Approve Step</span>
            </>
          )}
        </button>

        {/* Skip Button */}
        <button
          type="button"
          onClick={onSkip}
          disabled={isExecuting}
          className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl bg-white hover:bg-amber-50 active:bg-amber-100 disabled:opacity-50 text-amber-800 border border-amber-200 text-xs font-medium transition-colors cursor-pointer"
          title="Skip this step without executing and move to next"
        >
          <SkipForward className="w-3.5 h-3.5 text-amber-600" />
          <span>Skip</span>
        </button>

        {/* Stop Button */}
        <button
          type="button"
          onClick={onStop}
          disabled={isExecuting}
          className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl bg-white hover:bg-red-50 active:bg-red-100 disabled:opacity-50 text-red-700 border border-red-200 text-xs font-medium transition-colors cursor-pointer"
          title="Cancel and abort the errand"
        >
          <OctagonX className="w-3.5 h-3.5 text-red-600" />
          <span>Stop</span>
        </button>
      </div>

      {/* 4. Consequential Action Elevated Double-Confirmation Dialog (Task 4.4.3) */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consequential-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
        >
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-amber-200 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-700">
              <div className="p-2 rounded-xl bg-amber-100/80 border border-amber-200 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 id="consequential-dialog-title" className="text-sm font-bold text-slate-900 leading-tight">
                  Elevated Confirmation Required
                </h3>
                <p className="text-[11px] text-amber-800 font-medium">
                  Consequential Action Interceptor Gate
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 space-y-2">
              <p className="leading-relaxed">
                This action was detected as a <strong>consequential or irreversible operation</strong> (e.g., Submit, Pay, Transfer, Delete, Send, or Confirm Order).
              </p>
              <div className="text-[11px] text-slate-700 bg-white p-2 rounded-lg border border-amber-200/50 break-words">
                <strong>Action:</strong> {action.toUpperCase()}
                {target_id !== null && target_id !== undefined ? ` on #${target_id}` : ''}
                {value ? ` with value "${value}"` : ''}
              </div>
            </div>

            <label
              htmlFor="elevated-confirm-checkbox"
              className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none p-2 rounded-lg bg-slate-50 border border-slate-200"
            >
              <input
                id="elevated-confirm-checkbox"
                type="checkbox"
                checked={confirmCheckbox}
                onChange={(e) => setConfirmCheckbox(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer shrink-0"
              />
              <span className="text-[11px] font-medium leading-snug">
                I verify that I have reviewed the active page and explicitly authorize this consequential action.
              </span>
            </label>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setConfirmCheckbox(false);
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!confirmCheckbox || isExecuting}
                onClick={handleElevatedConfirm}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Confirm & Execute</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

