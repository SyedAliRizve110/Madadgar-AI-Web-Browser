import React, { useState } from 'react';
import {
  Youtube,
  BookOpen,
  Sparkles,
  Clock,
  Check,
  Copy,
  RotateCcw,
  ExternalLink,
  AlertCircle,
  Play,
  ListChecks,
  FileText,
  Layers,
} from 'lucide-react';
import type { SupportedLanguage, YouTubeTranscriptSegment } from '@/common/types';
import type { StructuredSummary } from '@/ai/prompts/summarizer';
import { parseTimestampToSeconds } from '@/content/extractor';

export type SummaryTab = 'all' | 'tldr' | 'highlights' | 'actions';

export interface SummaryCardProps {
  summary?: StructuredSummary | null;
  isLoading?: boolean;
  isStreaming?: boolean;
  streamingChunk?: string;
  sourceType?: 'article' | 'youtube';
  sourceTitle?: string;
  sourceAuthor?: string;
  sourceUrl?: string;
  videoId?: string;
  hasTranscript?: boolean;
  segments?: YouTubeTranscriptSegment[];
  wordCount?: number;
  readTimeMinutes?: number;
  durationText?: string;
  language?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  onSeekTimestamp?: (seconds: number) => void;
  onRefresh?: () => void;
  error?: string | null;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  summary,
  isLoading = false,
  isStreaming = false,
  streamingChunk = '',
  sourceType = 'article',
  sourceTitle = 'Current Page',
  sourceAuthor,
  sourceUrl,
  videoId,
  hasTranscript = true,
  segments,
  wordCount,
  readTimeMinutes,
  durationText,
  language = 'en',
  onLanguageChange,
  onSeekTimestamp,
  onRefresh,
  error,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<SummaryTab>('all');
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const isYouTube = sourceType === 'youtube' || Boolean(videoId);

  const toggleCheckItem = (index: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleCopy = () => {
    if (!summary?.rawText && !streamingChunk) return;
    const textToCopy = summary?.rawText || streamingChunk;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleTimestampClick = (timestampStr: string) => {
    const seconds = parseTimestampToSeconds(timestampStr);

    if (onSeekTimestamp) {
      onSeekTimestamp(seconds);
    } else if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (activeTabId) {
          chrome.tabs.sendMessage(activeTabId, {
            type: 'SEEK_YOUTUBE_VIDEO',
            seconds,
          });
        }
      });
    }

    if (videoId && !chrome?.tabs) {
      window.open(`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`, '_blank');
    }
  };

  /**
   * Renders text containing [mm:ss] or [hh:mm:ss] timestamp references
   * as clickable interactive badges with a play icon.
   */
  const renderTextWithTimestamps = (text: string) => {
    const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = timestampRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      const fullMatch = match[0]; // e.g. "[01:24]"
      const timeStr = match[1]; // e.g. "01:24"

      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      parts.push(
        <button
          key={`${matchIndex}-${timeStr}`}
          type="button"
          onClick={() => handleTimestampClick(timeStr)}
          title={`Jump video to ${timeStr}`}
          className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 text-[11px] font-mono font-medium transition-colors shadow-2xs cursor-pointer group"
        >
          <Play className="w-2.5 h-2.5 fill-indigo-600 group-hover:fill-indigo-800 text-indigo-600" />
          <span>{timeStr}</span>
        </button>
      );

      lastIndex = matchIndex + fullMatch.length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="w-full flex-1 min-h-0 bg-white flex flex-col">
      {/* 1. Article / Video Details Header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
                isYouTube
                  ? 'bg-red-50 text-red-600 border border-red-100'
                  : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
              }`}
            >
              {isYouTube ? <Youtube className="w-4 h-4 text-red-600" /> : <BookOpen className="w-4 h-4 text-indigo-600" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                    isYouTube
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  }`}
                >
                  {isYouTube ? 'YouTube Video' : 'Web Article'}
                </span>

                {isYouTube && !hasTranscript && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    Captions Disabled
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-xs text-slate-800 truncate mt-1 leading-snug" title={sourceTitle}>
                {sourceTitle}
              </h3>
            </div>
          </div>

          {/* Quick-switch English / Hinglish Segmented Control Toggle */}
          {onLanguageChange && (
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shrink-0 shadow-2xs text-[11px]">
              <button
                type="button"
                onClick={() => onLanguageChange('en')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  language === 'en'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch summary output to English"
              >
                English
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('hinglish')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  language === 'hinglish'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch summary output to conversational Hinglish"
              >
                Hinglish
              </button>
            </div>
          )}
        </div>

        {/* Source Meta Bar (Author, Word Count / Duration, Link) */}
        <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-y-1">
          <div className="flex items-center gap-2 truncate">
            {sourceAuthor && <span className="truncate font-medium text-slate-600">{sourceAuthor}</span>}
            {sourceAuthor && (wordCount || durationText || segments) && <span>•</span>}
            {!isYouTube && wordCount && wordCount > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <FileText className="w-3 h-3 text-slate-400" />
                <span>
                  ~{wordCount.toLocaleString()} words
                  {readTimeMinutes ? ` (${readTimeMinutes} min read)` : ''}
                </span>
              </span>
            )}
            {isYouTube && (durationText || (segments && segments.length > 0)) && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>
                  {durationText || `${segments?.length || 0} chapter markers`}
                </span>
              </span>
            )}
          </div>

          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-slate-400 hover:text-indigo-600 transition-colors shrink-0 font-medium"
            >
              <span>View Source</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Section View Mode Tabs (When summary is loaded) */}
      {summary && !isLoading && (
        <div className="flex items-center px-3 pt-2 bg-slate-50/40 border-b border-slate-100 gap-1 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t-md font-medium text-[11px] border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'border-indigo-600 text-indigo-700 bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>All Sections</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tldr')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t-md font-medium text-[11px] border-b-2 transition-colors ${
              activeTab === 'tldr'
                ? 'border-indigo-600 text-indigo-700 bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3 h-3 text-indigo-600" />
            <span>TL;DR</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('highlights')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t-md font-medium text-[11px] border-b-2 transition-colors ${
              activeTab === 'highlights'
                ? 'border-indigo-600 text-indigo-700 bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3 h-3 text-indigo-600" />
            <span>5 Highlights</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t-md font-medium text-[11px] border-b-2 transition-colors ${
              activeTab === 'actions'
                ? 'border-indigo-600 text-indigo-700 bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ListChecks className="w-3 h-3 text-emerald-600" />
            <span>Next Steps</span>
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Summarization error</p>
            <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <div className="p-4 space-y-4 flex-1">
        {/* Loading Skeleton */}
        {isLoading && !isStreaming && (
          <div className="space-y-3 animate-pulse py-2">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-16 bg-slate-100 rounded-lg"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            <div className="space-y-2">
              <div className="h-3 bg-slate-100 rounded"></div>
              <div className="h-3 bg-slate-100 rounded"></div>
              <div className="h-3 bg-slate-100 rounded"></div>
            </div>
          </div>
        )}

        {/* Live SSE Streaming Render */}
        {isStreaming && (
          <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-lg">
            <div className="flex items-center gap-2 mb-2 text-indigo-700 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Generating {language === 'hinglish' ? 'Hinglish' : 'English'} Summary...</span>
            </div>
            <div className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
              {streamingChunk}
              <span className="inline-block w-1.5 h-3.5 bg-indigo-600 ml-0.5 animate-pulse align-middle" />
            </div>
          </div>
        )}

        {/* Completed Structured Summary */}
        {summary && !isLoading && (
          <>
            {/* 1. TL;DR Callout Box */}
            {(activeTab === 'all' || activeTab === 'tldr') && summary.tldr && (
              <div className="p-3.5 bg-gradient-to-r from-indigo-50/90 via-blue-50/50 to-indigo-50/30 border border-indigo-100 rounded-lg shadow-2xs">
                <div className="flex items-center gap-1.5 text-indigo-900 font-semibold text-xs mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>TL;DR</span>
                </div>
                <p className="text-xs text-slate-800 leading-relaxed font-medium">
                  {summary.tldr}
                </p>
              </div>
            )}

            {/* 2. 5 Key Highlights List */}
            {(activeTab === 'all' || activeTab === 'highlights') && summary.keyTakeaways.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-slate-800 font-semibold text-xs">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {isYouTube ? 'Chapter Highlights & Timestamps' : '5 Key Takeaways'}
                  </span>
                </div>
                <ul className="space-y-2">
                  {summary.keyTakeaways.map((point, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-slate-700 flex items-start gap-2 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100 leading-relaxed"
                    >
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        {renderTextWithTimestamps(point)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3. Action Items / Next Steps Checklist */}
            {(activeTab === 'all' || activeTab === 'actions') && summary.actionableSteps.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-800 font-semibold text-xs">
                    <ListChecks className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Action Items Checklist</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Click item to mark done</span>
                </div>
                <div className="space-y-1.5">
                  {summary.actionableSteps.map((step, idx) => {
                    const isChecked = Boolean(checkedItems[idx]);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleCheckItem(idx)}
                        className={`w-full text-left flex items-start gap-2 text-xs p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 line-through opacity-80'
                            : 'bg-emerald-50/30 border-emerald-100 text-slate-700 hover:bg-emerald-50/60'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-emerald-400 bg-white text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                        <span className="flex-1 leading-relaxed">{step}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!summary && !isLoading && !isStreaming && !error && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 text-slate-400 space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <BookOpen className="w-5 h-5 stroke-[1.5]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">No summary loaded yet</p>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs leading-relaxed">
                Open an article or YouTube video tab and click <strong>Summarize Active Tab</strong> above.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Card Footer Actions */}
      <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-200/70 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!summary && !streamingChunk}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-medium shadow-2xs cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
          <span>{copied ? 'Copied' : 'Copy Summary'}</span>
        </button>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || isStreaming}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-medium shadow-2xs cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-slate-500 ${isLoading || isStreaming ? 'animate-spin' : ''}`} />
            <span>Re-summarize</span>
          </button>
        )}
      </div>
    </div>
  );
};
