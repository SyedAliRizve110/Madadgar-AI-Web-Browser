import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Sparkles,
  RotateCcw,
  Square,
  Copy,
  Check,
  AlertCircle,
  MessageSquare,
  Maximize2,
  Minimize2,
  FileText,
  BarChart3,
  Layout,
  Bug,
} from 'lucide-react';
import type { PageContext, SupportedLanguage, ScreenCaptureResult, DownscaledImageResult } from '@/common/types';
import { downscaleImage } from '@/common/image_utils';
import { AIGateway } from '@/ai/ai_gateway';

export interface ScreenshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageContext?: PageContext | null;
  language?: SupportedLanguage;
  onSendToChat?: (question: string, answer: string, imageThumbnail?: string) => void;
}

const QUICK_VISUAL_PROMPTS = [
  {
    icon: BarChart3,
    label: 'Explain Chart / Data',
    prompt: 'Explain the charts, metrics, trends, or data visualizations shown in this screenshot.',
  },
  {
    icon: FileText,
    label: 'Extract Text & Tables',
    prompt: 'Extract all key textual information, tables, and numeric data visible in this image.',
  },
  {
    icon: Layout,
    label: 'Inspect UI Layout',
    prompt: 'Analyze the user interface, navigation elements, visual layout, and UX hierarchy.',
  },
  {
    icon: Bug,
    label: 'Spot Bugs / Errors',
    prompt: 'Identify any error messages, visual bugs, broken elements, or anomalies on the screen.',
  },
];

export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  isOpen,
  onClose,
  pageContext,
  language = 'en',
  onSendToChat,
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<DownscaledImageResult | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const [question, setQuestion] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedAnswer, setStreamedAnswer] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const answerContainerRef = useRef<HTMLDivElement | null>(null);

  // Capture screen when modal opens
  useEffect(() => {
    if (isOpen) {
      handleCaptureScreenshot();
    } else {
      handleCleanup();
    }
  }, [isOpen]);

  const handleCleanup = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setImageData(null);
    setCaptureError(null);
    setQuestion('');
    setStreamedAnswer('');
    setAiError(null);
    setIsStreaming(false);
    setIsExpanded(false);
  };

  const handleCaptureScreenshot = async () => {
    setIsCapturing(true);
    setCaptureError(null);
    setAiError(null);

    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        throw new Error('Chrome runtime messaging is not available.');
      }

      const captureResult: ScreenCaptureResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB', quality: 80 }, (res) => {
          if (chrome.runtime?.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
              timestamp: Date.now(),
            });
          } else {
            resolve(res || { success: false, error: 'Empty capture response', timestamp: Date.now() });
          }
        });
      });

      if (!captureResult.success || !captureResult.dataUrl) {
        throw new Error(captureResult.error || 'Failed to capture browser viewport.');
      }

      // Downscale to max 1280px to prevent payload bloat
      const downscaled = await downscaleImage(captureResult.dataUrl, 1280, 0.85);
      setImageData(downscaled);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCaptureError(msg);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRequestSiteAccess = async () => {
    if (typeof chrome !== 'undefined' && chrome.permissions?.request) {
      try {
        const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
        if (granted) {
          handleCaptureScreenshot();
          return;
        }
      } catch (err) {
        console.warn('[ScreenshotModal] permissions.request notice:', err);
      }
    }
    handleCaptureScreenshot();
  };

  const handleAskAI = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || question).trim();
    if (!promptToSend || isStreaming || !imageData) return;

    setAiError(null);
    setStreamedAnswer('');
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let accumulated = '';
      await AIGateway.inspectVisualStream({
        prompt: promptToSend,
        imageBase64: imageData.base64,
        mimeType: imageData.mimeType,
        pageContext,
        language,
        signal: abortController.signal,
        onChunk: (_, total) => {
          accumulated = total;
          setStreamedAnswer(total);
          // auto scroll answer into view
          if (answerContainerRef.current) {
            answerContainerRef.current.scrollTop = answerContainerRef.current.scrollHeight;
          }
        },
      });

      setStreamedAnswer(accumulated);
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        // User stopped generation
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setAiError(msg);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleCopyAnswer = () => {
    if (!streamedAnswer) return;
    navigator.clipboard.writeText(streamedAnswer).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSendToChatAndClose = () => {
    if (onSendToChat && streamedAnswer) {
      onSendToChat(question || 'Visual Inspection of Viewport', streamedAnswer, imageData?.dataUrl);
    }
    onClose();
  };

  // Simple Markdown inline formatting for bold and bullet lists
  const renderFormattedMarkdown = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="font-semibold text-xs text-slate-900 mt-2 mb-1">{line.replace(/^###\s+/, '')}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={idx} className="font-semibold text-sm text-slate-900 mt-2.5 mb-1">{line.replace(/^##\s+/, '')}</h3>;
      }
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ') || /^\d+\.\s+/.test(line.trim());
      const cleanLine = isBullet ? line.trim().replace(/^[-*]\s+|^\d+\.\s+/, '') : line;

      // Bold **text** parser
      const parts = cleanLine.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="bg-slate-100 text-indigo-800 px-1 py-0.5 rounded font-mono text-[11px]">{part.slice(1, -1)}</code>;
        }
        return part;
      });

      if (isBullet) {
        return (
          <div key={idx} className="flex items-start gap-1.5 my-0.5 text-xs text-slate-800 leading-relaxed">
            <span className="text-indigo-600 font-bold mt-0.5">•</span>
            <div className="flex-1">{parts}</div>
          </div>
        );
      }

      if (!line.trim()) return <div key={idx} className="h-1.5" />;

      return <p key={idx} className="text-xs text-slate-800 leading-relaxed my-0.5">{parts}</p>;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 animate-fade-in select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-2xs shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-slate-900 truncate">Visual Inspection</h2>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                  Gemini Flash
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">Screenshot & ask about charts, diagrams, or UI</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {imageData && !isStreaming && (
              <button
                type="button"
                onClick={handleCaptureScreenshot}
                disabled={isCapturing}
                title="Retake viewport screenshot"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isCapturing ? 'animate-spin' : ''}`} />
                <span className="text-[11px] font-medium hidden sm:inline">Retake</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Close modal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-0">
          {/* Capturing State */}
          {isCapturing && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 animate-pulse">
                <Camera className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">Capturing visible viewport...</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Optimizing screenshot for Gemini 2.5 Flash</p>
              </div>
            </div>
          )}

          {/* Capture Error */}
          {captureError && !isCapturing && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-start gap-2 text-red-800 font-semibold">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>Screenshot Capture Blocked</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed pl-6">
                {captureError}
              </p>
              {(captureError.includes('permission') || captureError.includes('<all_urls>')) && (
                <div className="text-amber-900 bg-amber-50/90 border border-amber-200/80 p-2 rounded-md text-[11px] ml-6 leading-relaxed">
                  💡 <strong>Quick Fix:</strong> If this tab was open before updating the extension, please refresh this webpage (<kbd className="px-1 py-0.5 bg-white border rounded text-[10px]">F5</kbd> or <kbd className="px-1 py-0.5 bg-white border rounded text-[10px]">Ctrl+R</kbd>) and click <strong>Try Again</strong> below.
                </div>
              )}
              <div className="pl-6 pt-1 flex items-center gap-2">
                {(captureError.includes('permission') ||
                  captureError.includes('<all_urls>') ||
                  captureError.includes('activeTab')) && (
                  <button
                    type="button"
                    onClick={handleRequestSiteAccess}
                    className="px-3 py-1 rounded-md bg-indigo-600 text-white font-medium text-[11px] hover:bg-indigo-700 transition-colors cursor-pointer shadow-2xs"
                  >
                    Grant Site Access
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCaptureScreenshot}
                  className="px-3 py-1 rounded-md bg-white border border-slate-300 text-slate-700 font-medium text-[11px] hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Screenshot Preview Box */}
          {imageData && !isCapturing && (
            <div className="rounded-xl border border-slate-200 bg-slate-900/90 overflow-hidden relative group shadow-2xs">
              <div className={`w-full overflow-hidden flex items-center justify-center transition-all ${isExpanded ? 'max-h-80' : 'max-h-44'}`}>
                <img
                  src={imageData.dataUrl}
                  alt="Captured active viewport"
                  className="w-full object-contain cursor-pointer"
                  onClick={() => setIsExpanded(!isExpanded)}
                />
              </div>

              {/* Resolution Badge & Expand Overlay */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-white text-[10px] font-mono font-medium border border-white/10 shadow-2xs">
                  {imageData.width} × {imageData.height} (Downscaled ≤1280px)
                </span>
              </div>

              <div className="absolute top-2 right-2">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? 'Collapse preview' : 'Expand preview'}
                  className="p-1 rounded-md bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer"
                >
                  {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Quick Suggestions */}
          {imageData && !isCapturing && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Quick Visual Analysis
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_VISUAL_PROMPTS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setQuestion(item.prompt);
                        handleAskAI(item.prompt);
                      }}
                      disabled={isStreaming}
                      className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/60 hover:bg-indigo-50 hover:border-indigo-200 text-left transition-colors cursor-pointer disabled:opacity-50 group"
                    >
                      <Icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 shrink-0" />
                      <span className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-950 truncate">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Visual Question Input */}
          {imageData && !isCapturing && (
            <div className="space-y-2">
              <label htmlFor="visual-question" className="text-[11px] font-semibold text-slate-700 block">
                Your Question About This Viewport
              </label>
              <div className="relative">
                <textarea
                  id="visual-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleAskAI();
                    }
                  }}
                  placeholder="e.g. What does the bar chart indicate? What is the total sum in column 3? What does this error icon mean?"
                  rows={2}
                  disabled={isStreaming}
                  className="w-full text-xs p-2.5 pr-20 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none placeholder:text-slate-400 bg-white"
                />

                <div className="absolute right-2 bottom-2.5">
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStopStreaming}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-medium inline-flex items-center gap-1 hover:bg-red-700 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Square className="w-3 h-3 fill-white" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAskAI()}
                      disabled={!question.trim()}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium inline-flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-40 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Inspect</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {aiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">Visual Inspection Error</p>
                <p className="text-[11px] text-red-600 mt-0.5">{aiError}</p>
              </div>
            </div>
          )}

          {/* Streaming / Final Answer Container */}
          {(streamedAnswer || isStreaming) && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isStreaming ? 'animate-spin' : ''}`} />
                  <span>Visual Analysis Result</span>
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyAnswer}
                    disabled={!streamedAnswer}
                    title="Copy visual inspection answer"
                    className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer text-[11px] inline-flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  {onSendToChat && (
                    <button
                      type="button"
                      onClick={handleSendToChatAndClose}
                      title="Continue in Chat View"
                      className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer text-[11px] font-medium inline-flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Send to Chat</span>
                    </button>
                  )}
                </div>
              </div>

              <div
                ref={answerContainerRef}
                className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70 max-h-56 overflow-y-auto"
              >
                <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                  {renderFormattedMarkdown(streamedAnswer)}
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-indigo-600 ml-1 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
