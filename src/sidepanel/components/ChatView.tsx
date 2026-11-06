import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Trash2,
  Square,
  Globe,
  Youtube,
  AlertCircle,
  Copy,
  Check,
  MessageSquare,
  Play,
  RotateCcw,
  Camera,
  EyeOff,
  Download,
} from 'lucide-react';
import type {
  PageContext,
  ChatMessage,
  SupportedLanguage,
  ContextMenuActionPayload,
  ScanDOMResponse,
} from '@/common/types';
import { AIGateway, RateLimitCooldownError } from '@/ai/ai_gateway';
import { parseTimestampToSeconds } from '@/content/extractor';

export interface ChatViewProps {
  context: PageContext | null;
  language?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  onSeekTimestamp?: (seconds: number) => void;
  onSyncContext?: () => void;
  hasTabChanged?: boolean;
  pendingAction?: ContextMenuActionPayload | null;
  onActionHandled?: () => void;
  onOpenScreenshotModal?: () => void;
  injectedVisualPair?: { question: string; answer: string; imageThumbnail?: string } | null;
  onInjectedVisualHandled?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  context,
  language = 'en',
  onLanguageChange,
  onSeekTimestamp,
  onSyncContext,
  hasTabChanged = false,
  pendingAction,
  onActionHandled,
  onOpenScreenshotModal,
  injectedVisualPair,
  onInjectedVisualHandled,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasActiveBadges, setHasActiveBadges] = useState(false);
  const [isLlmMode, setIsLlmMode] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Rehydrate LLM switch state from storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['chat_llm_mode'], (res) => {
        if (res && res.chat_llm_mode !== undefined) {
          setIsLlmMode(Boolean(res.chat_llm_mode));
        }
      });
    }
  }, []);

  const handleToggleLlmMode = (enabled: boolean) => {
    setIsLlmMode(enabled);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ chat_llm_mode: enabled });
    }
  };

  // Helper to detect natural language element location requests (Task 3.4)
  const isLocatorQuery = (text: string): boolean => {
    const t = text.trim().toLowerCase();
    return (
      /^(where(\s+is|\s+are|\s+can\s+i|\s+do\s+i)?\b|find\b|locate\b|show\s+me\b|point\s+to\b|kahan\s+hai\b|kidhar\s+hai\b|dhoondo\b)/i.test(t) ||
      /\b(where\s+do\s+i|where\s+is|where\s+are|where\s+can\s+i|find\s+the|locate\s+the|show\s+me\s+the)\b/i.test(t)
    );
  };

  const handleClearBadges = () => {
    if (context?.tabId && context.tabId > 0 && typeof chrome !== 'undefined' && chrome?.tabs) {
      chrome.tabs.sendMessage(context.tabId, { type: 'CLEAR_BADGES' }, () => {
        // Ignore response or error if tab reloaded
      });
    }
    setHasActiveBadges(false);
  };

  // Auto-scroll to bottom of conversation
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Handle timestamp click
  const handleTimestampClick = (timeStr: string) => {
    const seconds = parseTimestampToSeconds(timeStr);
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
  };

  // Renders markdown snippets with timestamp play buttons
  const renderFormattedContent = (content: string) => {
    // Split into paragraphs / lines
    const lines = content.split('\n');

    return lines.map((line, lineIdx) => {
      // Headers
      if (line.startsWith('### ')) {
        return (
          <h4 key={lineIdx} className="font-semibold text-xs text-slate-900 mt-2 mb-1">
            {line.replace(/^###\s+/, '')}
          </h4>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h3 key={lineIdx} className="font-semibold text-sm text-slate-900 mt-2.5 mb-1.5">
            {line.replace(/^##\s+/, '')}
          </h3>
        );
      }

      // Bullet points
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ') || /^\d+\.\s+/.test(line.trim());
      const cleanLine = isBullet ? line.trim().replace(/^[-*]\s+|^\d+\.\s+/, '') : line;

      // Handle bold **text** and `code` and timestamps [mm:ss]
      const parts = renderInlineSpans(cleanLine);

      if (isBullet) {
        return (
          <div key={lineIdx} className="flex items-start gap-1.5 my-0.5 text-xs text-slate-800 leading-relaxed">
            <span className="text-indigo-600 font-bold mt-0.5">•</span>
            <div className="flex-1">{parts}</div>
          </div>
        );
      }

      if (!line.trim()) {
        return <div key={lineIdx} className="h-2" />;
      }

      return (
        <p key={lineIdx} className="text-xs text-slate-800 leading-relaxed my-1">
          {parts}
        </p>
      );
    });
  };

  const renderInlineSpans = (text: string): React.ReactNode => {
    const timestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = timestampRegex.exec(text)) !== null) {
      const matchIdx = match.index;
      const fullMatch = match[0];
      const time = match[1];

      if (matchIdx > lastIndex) {
        segments.push(renderBoldAndCode(text.substring(lastIndex, matchIdx)));
      }

      segments.push(
        <button
          key={`${matchIdx}-${time}`}
          type="button"
          onClick={() => handleTimestampClick(time)}
          className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-mono font-medium transition-colors cursor-pointer"
          title={`Seek video to ${time}`}
        >
          <Play className="w-2.5 h-2.5 fill-indigo-600 text-indigo-600" />
          <span>{time}</span>
        </button>
      );

      lastIndex = matchIdx + fullMatch.length;
    }

    if (lastIndex < text.length) {
      segments.push(renderBoldAndCode(text.substring(lastIndex)));
    }

    return segments.length > 0 ? segments : renderBoldAndCode(text);
  };

  const renderBoldAndCode = (text: string): React.ReactNode => {
    // Simple inline parser for **bold** and `code`
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-slate-100 text-indigo-800 px-1 py-0.5 rounded font-mono text-[11px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleClearChat = () => {
    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setErrorMessage(null);
    handleClearBadges();
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleDownloadChat = () => {
    if (messages.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const pageTitle = context?.title || 'Webpage';
    const pageUrl = context?.url || '';

    const lines: string[] = [
      '==================================================',
      'Madadgar AI Browser Chat Transcript',
      `Date: ${new Date().toLocaleString()}`,
      pageTitle ? `Page: ${pageTitle}` : '',
      pageUrl ? `URL: ${pageUrl}` : '',
      `Mode: ${isLlmMode ? 'LLM Mode (General AI + Page Context)' : 'Grounded Page QA'}`,
      '==================================================\n',
    ].filter(Boolean);

    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? 'User' : 'Madadgar AI';
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();
      lines.push(`[${timeStr}] ${roleLabel}:`);
      lines.push(msg.content.trim());
      lines.push('\n--------------------------------------------------\n');
    }

    const textContent = lines.join('\n');
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = (pageTitle || 'chat')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    link.download = `madadgar-chat-${sanitizedTitle}-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Automatically process pending context menu action (Task 2.3)
  useEffect(() => {
    if (pendingAction && pendingAction.prompt) {
      const action = pendingAction;
      onActionHandled?.();

      const effectiveContext: PageContext = {
        ...(context || {
          tabId: action.tabId || -1,
          title: action.tabTitle || 'Active Webpage',
          url: action.tabUrl || '',
          textContent: action.selectedText,
          length: action.selectedText.length,
        }),
        selection: action.selectedText,
      };

      handleSendMessage(action.prompt, effectiveContext);
    }
  }, [pendingAction]);

  // Handle injected visual inspection pair from ScreenshotModal (Task 2.4)
  useEffect(() => {
    if (injectedVisualPair) {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: injectedVisualPair.question,
        timestamp: Date.now(),
        imageThumbnail: injectedVisualPair.imageThumbnail,
        contextTitle: context?.title,
        contextUrl: context?.url,
      };

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now() + 1}`,
        role: 'assistant',
        content: injectedVisualPair.answer,
        timestamp: Date.now() + 1,
        isStreaming: false,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      onInjectedVisualHandled?.();
    }
  }, [injectedVisualPair]);

  const handleSendMessage = async (customPrompt?: string, overrideContext?: PageContext) => {
    const promptToSend = (customPrompt || inputPrompt).trim();
    if (!promptToSend || isStreaming) return;

    const baseCtx = overrideContext || context;
    const activeCtx: PageContext | null = baseCtx
      ? {
          ...baseCtx,
          textContent: baseCtx.textContent || baseCtx.selection || '',
          length: (baseCtx.textContent || baseCtx.selection || '').length,
        }
      : null;

    if (!isLlmMode && (!activeCtx || (!activeCtx.textContent && !activeCtx.selection))) {
      setErrorMessage(
        'No page context is loaded. Switch on "LLM" to ask any question to AI chat, or open an article tab to chat with page content.'
      );
      return;
    }

    setErrorMessage(null);
    setInputPrompt('');

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptToSend,
      timestamp: Date.now(),
      contextTitle: activeCtx?.title,
      contextUrl: activeCtx?.url,
    };

    const assistantMessageId = `assistant-${Date.now()}`;
    const initialAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    const updatedHistory = [...messages, userMessage];
    setMessages([...updatedHistory, initialAssistantMessage]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Task 3.4: "Find It For Me" Natural Language Element Locator
      if (
        isLocatorQuery(promptToSend) &&
        activeCtx?.tabId &&
        activeCtx.tabId > 0 &&
        typeof chrome !== 'undefined' &&
        chrome.tabs
      ) {
        const targetTabId = activeCtx.tabId;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: '🔍 Scanning interactive elements on active page...' }
              : m
          )
        );

        const scanRes = await new Promise<ScanDOMResponse | null>((resolve) => {
          chrome.tabs.sendMessage(
            targetTabId,
            { type: 'SCAN_INTERACTIVE_DOM', renderBadges: true },
            (response) => {
              if (chrome.runtime?.lastError || !response?.success) {
                resolve(null);
              } else {
                resolve(response);
              }
            }
          );
        });

        if (scanRes && scanRes.elements && scanRes.elements.length > 0) {
          setHasActiveBadges(true);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: `🔍 Found ${scanRes.elements.length} interactive elements. Locating match for: "${promptToSend}"...`,
                  }
                : m
            )
          );

          const locatorResult = await AIGateway.locateElement(
            promptToSend,
            scanRes.elements,
            { language, signal: abortController.signal }
          );

          if (locatorResult.targetId !== null) {
            // Pulse & scroll into view on the webpage!
            chrome.tabs.sendMessage(targetTabId, {
              type: 'LOCATE_ELEMENT',
              targetId: locatorResult.targetId,
            });

            const targetEl = scanRes.elements.find(
              (el) => el.id === locatorResult.targetId
            );
            const tagDesc = targetEl
              ? `\`[${targetEl.tag}${targetEl.type ? `:${targetEl.type}` : ''}]\` "${targetEl.label || targetEl.placeholder || targetEl.text || ''}"`
              : '';

            const reply = [
              `🎯 **Found it! Element #${locatorResult.targetId}** ${tagDesc}`,
              '',
              locatorResult.reason,
              '',
              `✨ *I have scrolled element #${locatorResult.targetId} into view on your screen and highlighted it with a glowing pulse box.*`,
            ].join('\n');

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: reply, isStreaming: false }
                  : m
              )
            );
            return;
          }
        }
      }

      let accumulated = '';
      await AIGateway.groundedChatStream({
        query: promptToSend,
        context: activeCtx,
        history: updatedHistory,
        language,
        mode: isLlmMode ? 'llm' : 'grounded',
        signal: abortController.signal,
        onChunk: (_, total) => {
          accumulated = total;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: total, isStreaming: true }
                : m
            )
          );
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: accumulated, isStreaming: false }
            : m
        )
      );
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        // User stopped generation
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId ? { ...m, isStreaming: false } : m
          )
        );
      } else {
        const isRateLimit = err instanceof RateLimitCooldownError;
        const errorMsg = isRateLimit
          ? `Rate limit active: All free-tier providers are cooling down. Please wait ${err.cooldownSeconds}s.`
          : err instanceof Error
          ? err.message
          : String(err);
        setErrorMessage(errorMsg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content:
                    m.content ||
                    (isRateLimit
                      ? 'Free-tier quota limit reached. Cooldown is active. You can add a Groq fallback key in Settings to avoid interruptions.'
                      : 'Sorry, I encountered an error while processing your request.'),
                  error: true,
                  isStreaming: false,
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const promptSuggestions = isLlmMode
    ? [
        'Explain this concept in depth with real-world applications.',
        'What are key counterarguments or alternative perspectives?',
        'Write a code sample or practical tutorial based on this.',
        'What are the core insights and takeaways?',
      ]
    : [
        'Where is the main action or submit button on this page?',
        'What is the core premise of this page?',
        'Summarize the key facts and data points.',
        'What actionable steps or conclusions are recommended?',
      ];

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* 1. Context Information Header */}
      <div className="p-3 bg-white border-b border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              {context?.isYouTube ? (
                <Youtube className="w-4 h-4 text-red-600" />
              ) : (
                <Globe className="w-4 h-4 text-indigo-600" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {isLlmMode ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-600" />
                    <span>LLM Connected</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Grounded QA
                  </span>
                )}
                {language && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    {language === 'hinglish' ? 'Hinglish' : 'English'}
                  </span>
                )}
              </div>
              <h3
                className="font-semibold text-xs text-slate-800 truncate mt-0.5 leading-snug"
                title={context?.title || 'No active page'}
              >
                {context?.title || 'Connect a tab to start chatting'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onLanguageChange && (
              <button
                type="button"
                onClick={() => onLanguageChange(language === 'en' ? 'hinglish' : 'en')}
                className="px-2 py-1 rounded-md text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                title="Toggle between English and Hinglish"
              >
                {language === 'en' ? 'EN' : 'Hinglish'}
              </button>
            )}

            {hasActiveBadges && (
              <button
                type="button"
                onClick={handleClearBadges}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                title="Clear overlay badges from the page"
              >
                <EyeOff className="w-3 h-3 text-amber-600" />
                <span>Clear Badges</span>
              </button>
            )}

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                title="Clear Chat History"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Tab switch warning / sync prompt */}
        {hasTabChanged && onSyncContext && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-amber-800 bg-amber-50/70 px-2 py-1.5 rounded-md border border-amber-200/80">
            <span>Switched tabs. Chat is still grounded in the previous page.</span>
            <button
              onClick={onSyncContext}
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 underline ml-2 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Sync Now</span>
            </button>
          </div>
        )}

        {/* Active Selection Action Bar */}
        {context?.selection && (
          <div className="mt-2 pt-2 border-t border-slate-100 bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100/90 shadow-2xs space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-indigo-950 font-medium overflow-hidden">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                <span className="font-semibold text-indigo-900 shrink-0">Selected text:</span>
                <span className="truncate italic text-slate-700 max-w-[200px]" title={context.selection}>
                  "{context.selection}"
                </span>
              </div>
            </div>

            {/* Prominent Quick Actions */}
            <div className="flex items-center flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    `Explain the following text clearly with key insights and context:\n\n"${context.selection}"`
                  )
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium shadow-2xs transition-colors cursor-pointer"
                title="Explain selected text with Madadgar"
              >
                <Sparkles className="w-3 h-3 text-indigo-200" />
                <span>Explain with Madadgar</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    `Translate the following text to ${language === 'hinglish' ? 'Hinglish' : 'English'}:\n\n"${context.selection}"`
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                title="Translate selection"
              >
                <Globe className="w-3 h-3 text-slate-500" />
                <span>Translate</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSendMessage(
                    `Draft a helpful, professional, and well-structured response to the following text:\n\n"${context.selection}"`
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                title="Draft reply"
              >
                <MessageSquare className="w-3 h-3 text-slate-500" />
                <span>Draft Reply</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Messages Scroll Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.length === 0 && (
          <div className="text-center py-8 px-4 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 mx-auto flex items-center justify-center shadow-2xs">
              <MessageSquare className="w-6 h-6 stroke-[1.8]" />
            </div>
            <div>
              <h4 className="font-semibold text-sm text-slate-800">
                {isLlmMode ? 'Ask Anything to LLM' : 'Ask Anything About This Page'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                {isLlmMode
                  ? 'Connected directly to LLM. Can answer questions about the active page as well as general knowledge, explanations, or topics beyond the page.'
                  : "Answers are grounded strictly in the active page's text. If something is missing from the page, Madadgar will tell you."}
              </p>
            </div>

            {/* Prompt Starter Chips */}
            <div className="pt-2 space-y-1.5 max-w-sm mx-auto text-left">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider text-center">Suggested queries</p>
              {promptSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(suggestion)}
                  className="w-full text-left text-xs p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50/60 hover:border-indigo-200 text-slate-700 transition-colors shadow-2xs flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">{suggestion}</span>
                  <Send className="w-3 h-3 text-slate-300 group-hover:text-indigo-600 shrink-0 ml-1.5" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Stream Feed */}
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div
                className={`max-w-[88%] rounded-2xl p-3.5 text-xs shadow-2xs ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-none'
                }`}
              >
                {!isUser && (
                  <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 text-indigo-600 font-semibold text-[11px]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Madadgar</span>
                      {isLlmMode && (
                        <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded-md">
                          LLM
                        </span>
                      )}
                    </div>
                    {message.content && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(message.id, message.content)}
                        className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
                        title="Copy Response"
                      >
                        {copiedId === message.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                )}

                {isUser ? (
                  <div>
                    {message.imageThumbnail && (
                      <div className="mb-2 rounded-lg overflow-hidden border border-white/20 bg-black/30 max-h-36 flex items-center justify-center">
                        <img
                          src={message.imageThumbnail}
                          alt="Captured Viewport"
                          className="max-h-36 w-full object-contain"
                        />
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                ) : (
                  <div className="prose prose-xs max-w-none">
                    {renderFormattedContent(message.content)}
                    {message.isStreaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-indigo-600 ml-1 animate-pulse align-middle" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="mx-3 mb-2 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="flex-1 text-[11px] leading-snug">{errorMessage}</p>
        </div>
      )}

      {/* 3. Bottom Chat Input Bar */}
      <div className="p-3 bg-white border-t border-slate-200/80">
        {/* Controls Bar: LLM Switch + Download Chat */}
        <div className="flex items-center justify-between mb-2 px-1">
          <button
            type="button"
            role="switch"
            aria-checked={isLlmMode}
            onClick={() => handleToggleLlmMode(!isLlmMode)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer select-none shadow-2xs ${
              isLlmMode
                ? 'bg-purple-600 text-white border border-purple-700 ring-2 ring-purple-100'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
            }`}
            title={
              isLlmMode
                ? 'LLM Switch ON: Connects directly to LLM. You can ask any question, including general knowledge and questions not on the page.'
                : 'LLM Switch OFF: Grounded Mode. Answers are strictly grounded in active page text.'
            }
          >
            <Sparkles className={`w-3.5 h-3.5 ${isLlmMode ? 'text-amber-300' : 'text-slate-400'}`} />
            <span>LLM</span>
            <span
              className={`w-6 h-3.5 flex items-center rounded-full p-0.5 transition-colors ${
                isLlmMode ? 'bg-purple-800 justify-end' : 'bg-slate-300 justify-start'
              }`}
            >
              <span className="bg-white w-2.5 h-2.5 rounded-full shadow-xs" />
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadChat}
            disabled={messages.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:text-indigo-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:text-slate-600 disabled:hover:bg-transparent border border-slate-200 transition-colors shadow-2xs cursor-pointer disabled:cursor-not-allowed"
            title="Download chat transcript as a .txt file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Chat</span>
          </button>
        </div>

        {isStreaming && (
          <div className="flex justify-center mb-2">
            <button
              type="button"
              onClick={handleStopStreaming}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-[11px] font-medium shadow-2xs transition-colors"
            >
              <Square className="w-3 h-3 fill-slate-700" />
              <span>Stop Generating</span>
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 shadow-2xs transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLlmMode
                ? 'Ask any question to LLM (with or without page context)...'
                : context?.title
                ? `Ask about "${context.title.substring(0, 30)}..."`
                : 'Ask a question about the active page...'
            }
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 resize-none outline-none max-h-24 py-1"
          />
          {onOpenScreenshotModal && (
            <button
              type="button"
              onClick={onOpenScreenshotModal}
              disabled={isStreaming}
              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-200/60 disabled:opacity-40 transition-colors shadow-2xs shrink-0 cursor-pointer"
              title="Screenshot viewport & ask about visuals"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!inputPrompt.trim() || isStreaming}
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs shrink-0 cursor-pointer"
            title="Send Message (Enter)"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 text-center">
          Press <strong>Enter</strong> to send • <strong>Shift+Enter</strong> for newline
        </p>
      </div>
    </div>
  );
};
