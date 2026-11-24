import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Layers,
  Award,
  AlertCircle,
  X,
} from 'lucide-react';
import type { ComparisonMatrix } from '@/common/types';

export interface ComparisonCardProps {
  initialMatrix?: ComparisonMatrix | null;
  onClose?: () => void;
}

export const ComparisonCard: React.FC<ComparisonCardProps> = ({
  initialMatrix = null,
  onClose,
}) => {
  const [matrix, setMatrix] = useState<ComparisonMatrix | null>(initialMatrix);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab selection state for launching a new comparison
  const [availableTabs, setAvailableTabs] = useState<chrome.tabs.Tab[]>([]);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [customUrls, setCustomUrls] = useState<string>('');
  const [focusDirective, setFocusDirective] = useState<string>('');

  useEffect(() => {
    loadOpenTabs();
  }, []);

  const loadOpenTabs = async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const validTabs = tabs.filter(
          (t) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('edge://')
        );
        setAvailableTabs(validTabs);
        // Default select first 2-3 tabs if not already set
        if (selectedTabIds.length === 0 && validTabs.length >= 2) {
          setSelectedTabIds(validTabs.slice(0, 3).map((t) => t.id!));
        }
      } catch (err: any) {
        console.warn('[ComparisonCard] Failed to query tabs:', err);
      }
    }
  };

  const handleToggleTab = (tabId: number) => {
    setSelectedTabIds((prev) =>
      prev.includes(tabId) ? prev.filter((id) => id !== tabId) : [...prev, tabId]
    );
  };

  const handleRunComparison = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        let response: { success: boolean; matrix?: ComparisonMatrix; error?: string };

        if (customUrls.trim()) {
          const urls = customUrls
            .split(/[\n,]+/)
            .map((u) => u.trim())
            .filter((u) => u.startsWith('http://') || u.startsWith('https://'));

          if (urls.length < 2) {
            throw new Error('Please provide at least 2 valid HTTP/HTTPS URLs to compare.');
          }

          response = await chrome.runtime.sendMessage({
            type: 'COMPARE_URLS',
            urls,
            options: { prompt: focusDirective || undefined },
          });
        } else {
          if (selectedTabIds.length < 2) {
            throw new Error('Please select at least 2 open tabs to compare.');
          }

          response = await chrome.runtime.sendMessage({
            type: 'COMPARE_TABS',
            tabIds: selectedTabIds,
            options: { prompt: focusDirective || undefined },
          });
        }

        if (response?.success && response.matrix) {
          setMatrix(response.matrix);
        } else {
          throw new Error(response?.error || 'Failed to synthesize comparison across tabs.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Comparison failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJumpToTab = (tabId: number) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.update) {
      chrome.tabs.update(tabId, { active: true }).catch(() => {});
    }
  };

  const handleCopyMarkdown = () => {
    if (!matrix) return;

    let md = `## ${matrix.topic}\n\n`;
    md += `${matrix.summary}\n\n`;

    // Markdown Table Header
    md += `| Attribute | ${matrix.items.map((i) => i.title.replace(/\|/g, '-')).join(' | ')} |\n`;
    md += `| :--- | ${matrix.items.map(() => ':---').join(' | ')} |\n`;

    // Markdown Table Rows
    for (const attr of matrix.attributes) {
      const rowVals = matrix.items.map((item) => (item.attributes[attr] || '—').replace(/\|/g, '-'));
      md += `| **${attr}** | ${rowVals.join(' | ')} |\n`;
    }

    if (matrix.recommendation) {
      md += `\n### Recommendation\n${matrix.recommendation}\n`;
    }

    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 p-4 overflow-y-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Cross-Tab Comparison Engine
            </h2>
            <p className="text-xs text-slate-500">
              Parallel map-reduce synthesis across active browser tabs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {matrix && (
            <button
              onClick={() => setMatrix(null)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              New Comparison
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Comparison"
              className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Setup / Tab Selector Form if no matrix active */}
      {!matrix && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-2.5 text-xs">
            <label className="block font-semibold text-slate-700">
              Select Open Tabs to Compare (Map Phase)
            </label>
            {availableTabs.length === 0 ? (
              <p className="text-slate-400 italic">No eligible web tabs open in current window.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {availableTabs.map((tab) => {
                  const isChecked = tab.id ? selectedTabIds.includes(tab.id) : false;
                  return (
                    <label
                      key={tab.id}
                      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-medium'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => tab.id && handleToggleTab(tab.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="truncate flex-1">{tab.title || tab.url}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Direct URL input alternative */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-2 text-xs">
            <label className="block font-semibold text-slate-700">
              Or Enter URLs Directly (Spawns & Monitors via TabCoordinator)
            </label>
            <textarea
              rows={2}
              value={customUrls}
              onChange={(e) => setCustomUrls(e.target.value)}
              placeholder="https://site-a.com/product1&#10;https://site-b.com/product2"
              className="w-full p-2 rounded-md border border-slate-200 font-mono text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* User Directive */}
          <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-1 text-xs">
            <label className="block font-semibold text-slate-700">
              Focus Attributes or Specific Criteria (Optional)
            </label>
            <input
              type="text"
              value={focusDirective}
              onChange={(e) => setFocusDirective(e.target.value)}
              placeholder="e.g., Focus on student discounts, warranty, and battery life"
              className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Run Button */}
          <button
            onClick={handleRunComparison}
            disabled={isLoading || (selectedTabIds.length < 2 && !customUrls.trim())}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Extracting & Synthesizing Tabs (Map-Reduce)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Cross-Tab Comparison</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Active Comparison Matrix View */}
      {matrix && (
        <div className="space-y-4">
          {/* Topic & Summary */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">{matrix.topic}</h3>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-[11px]">
                {matrix.items.length} items compared
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed">{matrix.summary}</p>
          </div>

          {/* Matrix Items Cards / Table */}
          <div className="space-y-3">
            {matrix.items.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden text-xs"
              >
                {/* Item Header */}
                <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div className="font-semibold text-slate-800 truncate pr-2">
                    {item.title}
                  </div>
                  <button
                    onClick={() => handleJumpToTab(item.tabId)}
                    title="Jump to Tab in Browser"
                    className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-white px-2 py-0.5 rounded border border-slate-200 hover:border-indigo-300 transition-colors shrink-0"
                  >
                    <span>Jump to Tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* Attributes Grid */}
                <div className="p-3 space-y-2">
                  {matrix.attributes.map((attr) => (
                    <div key={attr} className="grid grid-cols-3 gap-2 py-0.5 border-b border-slate-100 last:border-none">
                      <span className="font-semibold text-slate-500">{attr}:</span>
                      <span className="col-span-2 text-slate-800 font-medium">
                        {item.attributes[attr] || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Recommendation Card */}
          {matrix.recommendation && (
            <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg text-xs space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Synthesizer Recommendation</span>
              </div>
              <p className="text-emerald-950 leading-relaxed font-medium">
                {matrix.recommendation}
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Markdown Copied!' : 'Copy Comparison (Markdown)'}</span>
            </button>

            <button
              onClick={() => setMatrix(null)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-medium transition-colors cursor-pointer"
            >
              Compare Different Tabs
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
