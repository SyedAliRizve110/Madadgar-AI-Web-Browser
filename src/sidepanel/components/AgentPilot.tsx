import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Play,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  AlertCircle,
  Eye,
  History,
  ChevronDown,
  ChevronUp,
  OctagonX,
} from 'lucide-react';
import type {
  PageContext,
  AgentTaskSession,
  UserProfileMemory,
} from '@/common/types';
import { ActionCard } from './ActionCard';

export interface AgentPilotProps {
  context: PageContext | null;
  profileMemory?: UserProfileMemory;
  hasTabChanged?: boolean;
  onSyncContext?: () => void;
  onConfigureApiKey?: () => void;
}

export const AgentPilot: React.FC<AgentPilotProps> = ({
  context,
  profileMemory,
  hasTabChanged = false,
  onSyncContext,
}) => {
  const [session, setSession] = useState<AgentTaskSession | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [maxSteps, setMaxSteps] = useState(15);
  const [dryRun, setDryRun] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingStep, setIsExecutingStep] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);

  // 1. Fetch current session / rehydrate on mount
  const fetchSession = async () => {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;

    try {
      chrome.runtime.sendMessage({ type: 'GET_AGENT_SESSION' }, (response) => {
        if (!chrome.runtime.lastError && response?.session) {
          setSession(response.session);
          setDryRun(Boolean(response.session.dryRun));
        }
      });
    } catch (err) {
      console.warn('[AgentPilot] Failed to fetch session:', err);
    }
  };

  useEffect(() => {
    fetchSession();

    // Poll periodically while a task is in progress
    pollIntervalRef.current = setInterval(() => {
      if (
        session &&
        session.status !== 'IDLE' &&
        session.status !== 'TASK_COMPLETED' &&
        session.status !== 'TASK_ABORTED' &&
        session.status !== 'BLOCKED_SAFETY' &&
        session.status !== 'ERROR'
      ) {
        fetchSession();
      }
    }, 1500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [session?.status]);

  // 2. Start new task errand
  const handleStartTask = async (customGoal?: string) => {
    const goalToRun = (customGoal || goalInput).trim();
    if (!goalToRun) return;

    const tabId = context?.tabId;
    if (!tabId || tabId <= 0) {
      setErrorMessage('No active webpage detected. Please focus an active browser tab first.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    chrome.runtime.sendMessage(
      {
        type: 'START_AGENT_TASK',
        goal: goalToRun,
        tabId,
        maxSteps,
        dryRun,
        profileMemory,
        url: context?.url,
      },
      (response) => {
        setIsLoading(false);
        if (chrome.runtime?.lastError || !response?.success) {
          setErrorMessage(response?.error || chrome.runtime?.lastError?.message || 'Failed to start agent task.');
        } else if (response?.session) {
          setSession(response.session);
          setGoalInput('');
        }
      }
    );
  };

  // 3. Approve Step
  const handleApproveStep = async () => {
    setIsExecutingStep(true);
    setErrorMessage(null);

    chrome.runtime.sendMessage({ type: 'APPROVE_AGENT_STEP' }, (response) => {
      setIsExecutingStep(false);
      if (chrome.runtime?.lastError || !response?.success) {
        setErrorMessage(response?.error || chrome.runtime?.lastError?.message || 'Failed to approve step.');
      } else if (response?.session) {
        setSession(response.session);
      }
    });
  };

  // 4. Skip Step
  const handleSkipStep = async () => {
    setIsExecutingStep(true);
    setErrorMessage(null);

    chrome.runtime.sendMessage({ type: 'SKIP_AGENT_STEP' }, (response) => {
      setIsExecutingStep(false);
      if (chrome.runtime?.lastError || !response?.success) {
        setErrorMessage(response?.error || chrome.runtime?.lastError?.message || 'Failed to skip step.');
      } else if (response?.session) {
        setSession(response.session);
      }
    });
  };

  // 5. Stop Task
  const handleStopTask = async () => {
    chrome.runtime.sendMessage(
      { type: 'STOP_AGENT_TASK', reason: 'Stopped by user.' },
      (response) => {
        if (response?.session) {
          setSession(response.session);
        }
      }
    );
  };

  // 6. Reset Session to IDLE
  const handleResetSession = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'CLEAR_AGENT_SESSION' }, () => {});
    }
    setSession(null);
    setGoalInput('');
    setErrorMessage(null);
    if (context?.tabId && typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.sendMessage(context.tabId, { type: 'CLEAR_BADGES' }, () => {});
    }
  };

  const starterErrands = [
    'Fill the form fields with my profile information',
    'Find and click the signup or get started button',
    'Search for this query and sort results by rating',
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 relative select-none">
      {/* 1. Sub-Header: Context & Safety Badge */}
      <div className="p-3 bg-white border-b border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-indigo-600" />
                  <span>HITL Guardrails Active</span>
                </span>
                {session?.status && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    {session.status}
                  </span>
                )}
              </div>
              <h3
                className="font-semibold text-xs text-slate-800 truncate mt-0.5"
                title={context?.title || 'No active page'}
              >
                {context?.title || 'Connect a tab to begin'}
              </h3>
            </div>
          </div>

          {session && (
            <button
              type="button"
              onClick={handleResetSession}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
              title="Reset errand"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tab Switch Sync Banner */}
        {hasTabChanged && onSyncContext && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-amber-800 bg-amber-50/70 px-2 py-1.5 rounded-md border border-amber-200/80">
            <span>Switched tabs. Pilot is tracking previous page.</span>
            <button
              onClick={onSyncContext}
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 underline ml-2 shrink-0 cursor-pointer"
            >
              <span>Sync Tab</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Scrollable Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-[11px]">Notice:</p>
              <p className="text-[11px] leading-snug">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* State: IDLE - Errand Input & Configuration */}
        {!session || session.status === 'IDLE' ? (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h4 className="font-semibold text-xs text-slate-800">
                  What errand should Madadgar handle on this page?
                </h4>
              </div>

              <textarea
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="e.g., Fill the job application form with my contact details, then continue to the next step"
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none select-text"
              />

              {/* Errand Configuration Controls */}
              <div className="pt-1 flex items-center justify-between gap-3 text-xs text-slate-600 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Max steps:</span>
                  <select
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(Number(e.target.value))}
                    className="text-[11px] font-medium py-1 px-2 rounded-lg border border-slate-200 bg-white focus:outline-hidden"
                  >
                    <option value={5}>5 steps</option>
                    <option value={10}>10 steps</option>
                    <option value={15}>15 steps (default)</option>
                    <option value={20}>20 steps</option>
                  </select>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3 text-slate-500" />
                    <span>Dry-run inspection</span>
                  </span>
                </label>
              </div>

              {/* Start Button */}
              <button
                type="button"
                onClick={() => handleStartTask()}
                disabled={isLoading || !goalInput.trim()}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Initializing Errand...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Start Pilot Errand</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Starter Suggestions */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider text-center">
                Example Errands
              </p>
              {starterErrands.map((starter, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleStartTask(starter)}
                  className="w-full text-left text-xs p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50/60 hover:border-indigo-200 text-slate-700 transition-colors shadow-2xs flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">{starter}</span>
                  <Play className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 shrink-0 ml-1.5" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* State: SCANNING_DOM / DOM_MAPPED / REASONING_AI */}
        {(session?.status === 'SCANNING_DOM' ||
          session?.status === 'DOM_MAPPED' ||
          session?.status === 'REASONING_AI' ||
          session?.status === 'SAFETY_VALIDATION') && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs text-center space-y-3 animate-fadeIn">
            <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 mx-auto flex items-center justify-center">
              <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <h4 className="font-semibold text-xs text-slate-800">
                {session.status === 'SCANNING_DOM'
                  ? 'Scanning Interactive DOM...'
                  : session.status === 'REASONING_AI'
                  ? 'AI Reasoning & Planning Safe Action...'
                  : 'Validating Action Safety Policies...'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                {session.status === 'REASONING_AI'
                  ? 'Evaluating interactive elements to propose the single best step.'
                  : 'Mapping clickable buttons, links, and form fields on the active tab.'}
              </p>
            </div>
          </div>
        )}

        {/* State: AWAITING_APPROVAL -> Render ActionCard (Task 3.7) */}
        {session?.status === 'AWAITING_APPROVAL' && session.pendingProposal && (
          <ActionCard
            step={session.currentStep}
            maxSteps={session.maxSteps}
            proposal={session.pendingProposal}
            dryRun={dryRun}
            onToggleDryRun={(enabled) => setDryRun(enabled)}
            onApprove={handleApproveStep}
            onSkip={handleSkipStep}
            onStop={handleStopTask}
            isExecuting={isExecutingStep}
          />
        )}

        {/* State: EXECUTING_ACTION / VERIFYING_STATE */}
        {(session?.status === 'EXECUTING_ACTION' || session?.status === 'VERIFYING_STATE') && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs text-center space-y-3 animate-fadeIn">
            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
              <span className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <h4 className="font-semibold text-xs text-slate-800">
                {session.status === 'EXECUTING_ACTION'
                  ? 'Dispatching Synthetic Event...'
                  : 'Verifying DOM State & Result...'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Performing approved step and waiting for reactive framework state update.
              </p>
            </div>
          </div>
        )}

        {/* State: TASK_COMPLETED */}
        {session?.status === 'TASK_COMPLETED' && (
          <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm text-center space-y-3 animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle className="w-7 h-7 stroke-[2]" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900">Errand Successfully Achieved!</h4>
              <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                Goal: <span className="font-semibold text-slate-800">"{session.goal}"</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Completed across {session.history.length} human-approved steps.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetSession}
              className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Start Another Errand
            </button>
          </div>
        )}

        {/* State: BLOCKED_SAFETY */}
        {session?.status === 'BLOCKED_SAFETY' && (
          <div className="bg-white p-5 rounded-2xl border border-red-200 shadow-sm text-center space-y-3 animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 mx-auto flex items-center justify-center">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900">Safety Guardrail Triggered</h4>
              <p className="text-xs text-red-700 mt-1 max-w-xs mx-auto">
                {session.error || 'Autonomous agent execution was blocked by safety policy.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetSession}
              className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Return to Safety
            </button>
          </div>
        )}

        {/* State: TASK_ABORTED or ERROR */}
        {(session?.status === 'TASK_ABORTED' || session?.status === 'ERROR') && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center space-y-3 animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
              <OctagonX className="w-7 h-7 text-slate-500" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900">
                {session.status === 'TASK_ABORTED' ? 'Errand Stopped' : 'Encountered Error'}
              </h4>
              <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                {session.error || 'The errand was stopped.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetSession}
              className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Reset Pilot
            </button>
          </div>
        )}

        {/* 3. Steps History Feed */}
        {session && session.history && session.history.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
              className="w-full p-3 bg-slate-50/70 border-b border-slate-200/70 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-indigo-600" />
                <span>Step History ({session.history.length})</span>
              </div>
              {isHistoryExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {isHistoryExpanded && (
              <div className="p-3 space-y-2 max-h-56 overflow-y-auto divide-y divide-slate-100">
                {session.history.map((record, index) => {
                  const isSuccess = record.result?.success;
                  const isSkipped = record.result?.error?.includes('Skipped');

                  return (
                    <div key={index} className="pt-2 first:pt-0 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-[11px]">
                          Step {record.step}: <span className="uppercase text-indigo-600">{record.action.action}</span>
                          {record.action.target_id && ` on #${record.action.target_id}`}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isSkipped
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : isSuccess
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {isSkipped ? 'Skipped' : isSuccess ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 italic">
                        "{record.action.reason}"
                      </p>
                      {record.action.value && (
                        <p className="text-[10px] font-mono text-slate-500 bg-slate-50 p-1 rounded">
                          Value: {record.action.value}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
