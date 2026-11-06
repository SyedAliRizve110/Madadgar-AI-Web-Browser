import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Download,
  Trash2,
  Search,
  CheckCircle2,
  FastForward,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  MousePointer,
  Keyboard,
  ListFilter,
  ArrowUpDown,
  CheckCheck,
  AlertTriangle,
  X,
  ExternalLink,
  Clock,
} from 'lucide-react';
import type { AuditLogEntry } from '@/common/types';
import { getAuditLogs, clearAuditLogs, exportAuditLogsJson } from '@/common/storage_adapter';

export interface AuditLogProps {
  onClose?: () => void;
  filterTaskId?: string;
}

export const AuditLog: React.FC<AuditLogProps> = ({ onClose, filterTaskId }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'approved' | 'skipped' | 'stopped'>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.warn('[AuditLog] Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClear = async () => {
    await clearAuditLogs();
    setLogs([]);
    setShowClearConfirm(false);
  };

  const handleExport = async () => {
    try {
      const json = await exportAuditLogsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `madadgar-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[AuditLog] Failed to export audit logs:', err);
    }
  };

  const handleCopyEntry = (entry: AuditLogEntry) => {
    const text = JSON.stringify(entry, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterTaskId && log.taskId !== filterTaskId) return false;
      if (decisionFilter !== 'all' && log.userDecision !== decisionFilter) return false;
      if (actionFilter !== 'all' && log.actionType !== actionFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = log.description?.toLowerCase().includes(q);
        const matchReason = log.reasoning?.toLowerCase().includes(q);
        const matchUrl = log.url?.toLowerCase().includes(q);
        const matchTask = log.taskId?.toLowerCase().includes(q);
        const matchVal = log.value?.toLowerCase().includes(q);
        if (!matchDesc && !matchReason && !matchUrl && !matchTask && !matchVal) return false;
      }
      return true;
    });
  }, [logs, filterTaskId, decisionFilter, actionFilter, searchQuery]);

  const renderActionBadge = (action: string) => {
    switch (action) {
      case 'click':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-semibold uppercase">
            <MousePointer className="w-2.5 h-2.5" />
            <span>CLICK</span>
          </span>
        );
      case 'type':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-semibold uppercase">
            <Keyboard className="w-2.5 h-2.5" />
            <span>TYPE</span>
          </span>
        );
      case 'select':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-mono font-semibold uppercase">
            <ListFilter className="w-2.5 h-2.5" />
            <span>SELECT</span>
          </span>
        );
      case 'scroll':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-mono font-semibold uppercase">
            <ArrowUpDown className="w-2.5 h-2.5" />
            <span>SCROLL</span>
          </span>
        );
      case 'done':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-semibold uppercase">
            <CheckCheck className="w-2.5 h-2.5" />
            <span>DONE</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-mono font-semibold uppercase">
            {action}
          </span>
        );
    }
  };

  const renderDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Approved</span>
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium">
            <FastForward className="w-3 h-3 text-amber-600" />
            <span>Skipped</span>
          </span>
        );
      case 'stopped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-medium">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>Stopped</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative select-none">
      {/* 1. Header */}
      <div className="p-3 bg-white border-b border-slate-200 shadow-2xs shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-xs text-slate-900">Action Audit Log</h3>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700">
                  {filteredLogs.length}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                Immutable trace of human-approved and skipped agent actions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={logs.length === 0}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-40 cursor-pointer"
              title="Export Audit Log as JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={logs.length === 0}
              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-40 cursor-pointer"
              title="Clear Audit Log"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors ml-1 cursor-pointer"
                title="Close Audit Log"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Clear Confirmation Banner */}
        {showClearConfirm && (
          <div className="mt-2.5 p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs animate-fade-in">
            <div className="flex items-center gap-1.5 text-rose-800 text-[11px] font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Clear all {logs.length} audit records?</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClear}
                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-medium text-[10px] cursor-pointer"
              >
                Yes, Clear
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 text-[10px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 2. Search & Filter Bar */}
        <div className="mt-2.5 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search actions, reasons, or URLs..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center justify-between gap-1 overflow-x-auto text-[10px]">
            <div className="flex items-center gap-1">
              {(['all', 'approved', 'skipped', 'stopped'] as const).map((dec) => (
                <button
                  key={dec}
                  type="button"
                  onClick={() => setDecisionFilter(dec)}
                  className={`px-2 py-0.5 rounded-full capitalize font-medium transition-colors cursor-pointer ${
                    decisionFilter === dec
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {dec}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {(['all', 'click', 'type', 'select', 'scroll'] as const).map((act) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setActionFilter(act)}
                  className={`px-1.5 py-0.5 rounded capitalize font-mono text-[9px] transition-colors cursor-pointer ${
                    actionFilter === act
                      ? 'bg-slate-800 text-white'
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {act}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Log List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-xs text-slate-400">
            <span>Loading audit log records...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4 space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-slate-700">No Audit Records Found</p>
            <p className="text-[11px] text-slate-500 max-w-xs">
              Actions proposed by the agent and decided by you (Approved, Skipped, Stopped) will be logged here.
            </p>
          </div>
        ) : (
          filteredLogs.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div
                key={entry.id}
                className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:border-slate-300 transition-all text-xs space-y-2"
              >
                {/* Entry Header */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-slate-800 text-[11px]">
                      Step {entry.stepIndex}
                    </span>
                    <span className="text-slate-300">•</span>
                    {renderActionBadge(entry.actionType)}
                    {typeof entry.targetBadgeId === 'number' && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-slate-700 text-[10px]">
                        #{entry.targetBadgeId}
                      </span>
                    )}
                  </div>
                  {renderDecisionBadge(entry.userDecision)}
                </div>

                {/* Description & Value */}
                <div className="space-y-1">
                  <p className="font-medium text-slate-900 text-xs">
                    {entry.description}
                  </p>
                  {entry.value && (
                    <div className="bg-slate-50 border border-slate-100 rounded px-2 py-1 text-[11px] text-slate-700 font-mono break-all">
                      <span className="text-slate-400 select-none">value: </span>
                      "{entry.value}"
                    </div>
                  )}
                  {entry.reasoning && (
                    <p className="text-[11px] text-slate-600 italic leading-relaxed">
                      "{entry.reasoning}"
                    </p>
                  )}
                </div>

                {/* Footer Metadata & Expand Toggle */}
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    <span className="text-slate-300">•</span>
                    <span className="truncate text-slate-500 font-mono">
                      Task {entry.taskId ? entry.taskId.slice(-8) : 'unknown'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyEntry(entry)}
                      className="p-1 hover:text-slate-700 text-slate-400 rounded transition-colors cursor-pointer"
                      title="Copy Entry JSON"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="inline-flex items-center gap-0.5 px-1 py-0.5 hover:text-slate-700 text-slate-400 rounded transition-colors cursor-pointer"
                      title={isExpanded ? 'Collapse' : 'Expand Details'}
                    >
                      <span>{isExpanded ? 'Less' : 'More'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Detailed Inspection */}
                {isExpanded && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-600 animate-fade-in bg-slate-50/70 p-2 rounded-lg">
                    {entry.url && (
                      <div className="flex items-start gap-1">
                        <span className="font-semibold text-slate-700 shrink-0">URL:</span>
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline truncate inline-flex items-center gap-1"
                        >
                          <span className="truncate">{entry.url}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      </div>
                    )}
                    {typeof entry.executionSuccess === 'boolean' && (
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">Execution:</span>
                        <span
                          className={`font-medium ${
                            entry.executionSuccess ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {entry.executionSuccess ? 'Success' : `Failed (${entry.error || 'Unknown error'})`}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                      <span>ID: {entry.id}</span>
                      <span>•</span>
                      <span>{new Date(entry.timestamp).toISOString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
