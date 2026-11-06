import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  MessageSquare,
  Bot,
  BookmarkCheck,
  Settings,
  OctagonX,
  ShieldCheck,
  Key,
  AlertTriangle,
  Languages,
  Camera,
} from 'lucide-react';
import { getSettings } from '@/common/storage_adapter';
import type { AppSettings, SupportedLanguage, ExtractReadabilityResponse } from '@/common/types';
import { SettingsModal } from './components/SettingsModal';
import { ScreenshotModal } from './components/ScreenshotModal';
import { SummaryCard } from './components/SummaryCard';
import { ChatView } from './components/ChatView';
import { AgentPilot } from './components/AgentPilot';
import { RateLimitBanner } from './components/RateLimitBanner';
import { MadadgarLogo } from './components/MadadgarLogo';
import { useTabContext } from './hooks/useTabContext';
import { AIGateway } from '@/ai/ai_gateway';
import type { StructuredSummary } from '@/ai/prompts/summarizer';
import { isYouTubeUrl, extractYouTubeVideoId } from '@/content/extractor';


export type TabType = 'summarizer' | 'chat' | 'agent' | 'skills' | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('summarizer');
  const [killSwitchTriggered, setKillSwitchTriggered] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [injectedVisualPair, setInjectedVisualPair] = useState<{ question: string; answer: string; imageThumbnail?: string } | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const {
    context: activePageContext,
    hasTabChanged,
    pendingAction,
    clearPendingAction,
    syncWithActiveTab,
    dismissTabChangeNotification,
  } = useTabContext();

  // Switch to Chat tab when a context menu action (Explain, Translate, Draft) is triggered
  useEffect(() => {
    if (pendingAction) {
      setActiveTab('chat');
    }
  }, [pendingAction]);


  const [summary, setSummary] = useState<StructuredSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isStreamingSummary, setIsStreamingSummary] = useState(false);
  const [streamingChunk, setStreamingChunk] = useState('');
  const [summarizerLang, setSummarizerLang] = useState<SupportedLanguage>('en');
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [cachedContent, setCachedContent] = useState<ExtractReadabilityResponse | null>(null);
  const [pageMetadata, setPageMetadata] = useState<{
    title: string;
    url?: string;
    author?: string;
    isYouTube: boolean;
    videoId?: string;
    hasTranscript?: boolean;
    wordCount?: number;
    readTimeMinutes?: number;
    segments?: any[];
  }>({
    title: 'Current Tab',
    isYouTube: false,
    hasTranscript: true,
  });

  const refreshSettings = () => {
    getSettings().then((s) => {
      setSettings(s);
      if (s?.defaultLanguage) {
        setSummarizerLang(s.defaultLanguage);
      }
    });
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  const handleSummarize = async (langToUse?: SupportedLanguage) => {
    const lang = langToUse || summarizerLang;
    setIsLoadingSummary(true);
    setIsStreamingSummary(true);
    setStreamingChunk('');
    setSummarizeError(null);

    try {
      let activeTabUrl = '';
      let activeTabTitle = '';
      let activeTabId: number | undefined;

      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (tab) {
          activeTabUrl = tab.url || '';
          activeTabTitle = tab.title || '';
          activeTabId = tab.id;
        }
      }

      if (
        activeTabUrl.startsWith('chrome://') ||
        activeTabUrl.startsWith('chrome-extension://') ||
        activeTabUrl.startsWith('edge://')
      ) {
        throw new Error(
          'Chrome internal pages cannot be summarized. Please switch to a web article or YouTube video.'
        );
      }

      let contentResult: ExtractReadabilityResponse | null = null;
      if (activeTabId) {
        try {
          contentResult = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              activeTabId!,
              { type: 'EXTRACT_READABILITY_CONTENT' },
              (response) => {
                if (chrome.runtime?.lastError) {
                  resolve(null);
                } else {
                  resolve(response);
                }
              }
            );
          });
        } catch (tabErr) {
          console.warn('Could not extract via tab message:', tabErr);
        }
      }

      // If activePageContext is already loaded and fresh for this tab, leverage it
      if (
        !contentResult &&
        activePageContext &&
        activePageContext.tabId === activeTabId &&
        activePageContext.textContent
      ) {
        contentResult = {
          title: activePageContext.title,
          textContent: activePageContext.textContent,
          byline: activePageContext.byline || null,
          length: activePageContext.length,
          isYouTube: activePageContext.isYouTube,
          youTubeData: activePageContext.youTubeData,
        };
      }

      // If fresh extraction succeeded, cache it; otherwise fall back to previously cached content
      if (contentResult && contentResult.textContent) {
        setCachedContent(contentResult);
      } else if (cachedContent && cachedContent.textContent) {
        contentResult = cachedContent;
      } else if (!contentResult) {
        throw new Error(
          'Could not connect to page. If this tab was open before installing the extension, please refresh the page once.'
        );
      }

      const textToSummarize = contentResult.textContent || '';
      if (!textToSummarize.trim()) {
        throw new Error('No readable text content could be extracted from this page.');
      }

      const words = textToSummarize.split(/\s+/).filter(Boolean).length;
      const readTime = Math.max(1, Math.ceil(words / 200));

      const title = contentResult?.title || activeTabTitle || 'Current Tab';
      const isYt = contentResult?.isYouTube || isYouTubeUrl(activeTabUrl);
      const videoId = contentResult?.youTubeData?.videoId || extractYouTubeVideoId(activeTabUrl) || undefined;
      const hasTranscript = contentResult?.youTubeData?.hasTranscript ?? true;

      setPageMetadata({
        title,
        url: activeTabUrl,
        author: contentResult?.byline || contentResult?.youTubeData?.channelTitle || undefined,
        isYouTube: isYt,
        videoId,
        hasTranscript,
        wordCount: words,
        readTimeMinutes: readTime,
        segments: contentResult?.youTubeData?.segments,
      });

      let result: StructuredSummary;
      if (isYt) {
        result = await AIGateway.summarizeYouTubeStream(textToSummarize, {
          language: lang,
          title,
          url: activeTabUrl,
          videoId,
          hasTranscript,
          channelTitle: contentResult?.byline || contentResult?.youTubeData?.channelTitle || undefined,
          description: contentResult?.youTubeData?.description,
          onChunk: (_, accumulated) => {
            setStreamingChunk(accumulated);
          },
        });
      } else {
        result = await AIGateway.summarizeArticleStream(textToSummarize, {
          language: lang,
          title,
          url: activeTabUrl,
          author: contentResult?.byline || undefined,
          onChunk: (_, accumulated) => {
            setStreamingChunk(accumulated);
          },
        });
      }

      setSummary(result);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSummarizeError(errorMsg);
    } finally {
      setIsLoadingSummary(false);
      setIsStreamingSummary(false);
    }
  };


  const handleKillSwitch = () => {
    setKillSwitchTriggered(true);
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(
        { type: 'STOP_AGENT_TASK', reason: 'Emergency kill switch triggered by user.' },
        () => {}
      );
    }
    setTimeout(() => {
      setKillSwitchTriggered(false);
    }, 2500);
  };

  const hasApiKey = Boolean(settings?.geminiApiKey);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-800 select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 shadow-xs">
        <div className="flex items-center space-x-2.5">
          <div className="shrink-0 drop-shadow-xs">
            <MadadgarLogo className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="font-bold text-slate-900 text-sm tracking-tight">Madadgar</h1>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                v1.0
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-none mt-0.5">Human-in-the-Loop Assistant</p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setIsScreenshotModalOpen(true)}
            title="Visual Inspection (Screenshot active viewport & Ask)"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Configure API Keys & Settings"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={handleKillSwitch}
            title="Emergency Kill Switch (Stops all actions immediately)"
            className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 text-xs font-medium ${
              killSwitchTriggered
                ? 'bg-red-600 text-white border-red-700 animate-pulse'
                : 'text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300'
            }`}
          >
            <OctagonX className="w-4 h-4" />
            <span className="text-[11px]">{killSwitchTriggered ? 'Stopped' : 'Stop'}</span>
          </button>
        </div>
      </header>

      {/* Active Tab Switch Sync Banner */}
      {hasTabChanged && (
        <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between text-xs text-indigo-900 animate-fadeIn">
          <div className="flex items-center space-x-1.5 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="truncate text-[11px]">
              Switched tabs. Sync context with active page?
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => syncWithActiveTab(true)}
              className="px-2 py-0.5 rounded bg-indigo-600 text-white font-medium text-[10px] hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
            >
              Sync Tab
            </button>
            <button
              onClick={dismissTabChangeNotification}
              className="text-[10px] text-slate-500 hover:text-slate-700 px-1 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* API Key Missing Alert Banner */}
      {!hasApiKey && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-[11px]">Gemini API key is required to start.</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-[11px] font-semibold text-amber-900 underline hover:text-amber-950"
          >
            Setup Key
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="flex items-center justify-around px-2 py-1.5 bg-slate-100/80 border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveTab('summarizer')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'summarizer'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Summarizer</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => setActiveTab('agent')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'agent'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Pilot</span>
        </button>

        <button
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'skills'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <BookmarkCheck className="w-3.5 h-3.5" />
          <span>Skills</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('settings');
            setIsSettingsOpen(true);
          }}
          className={`p-1.5 rounded-md transition-colors ${
            activeTab === 'settings'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
          title="Settings & API Keys"
        >
          <Settings className="w-4 h-4" />
        </button>
      </nav>

      {/* Free-Tier Resilience & Rate Limit Cooldown Banner (Task 2.5) */}
      <RateLimitBanner onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Tab View Container */}
      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'summarizer' && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
            {!hasApiKey ? (
              <div className="p-4 m-4 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-2">
                <p className="font-medium">Get Started:</p>
                <p className="text-slate-600">
                  Configure your Google Gemini API key to begin generating 1-line TL;DRs and key takeaways.
                </p>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="mt-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium text-xs hover:bg-indigo-700 transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Configure API Key</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Top Summarize Action Bar */}
                <div className="p-3 bg-white border-b border-slate-200/80 flex items-center gap-2 shrink-0 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleSummarize()}
                    disabled={isLoadingSummary || isStreamingSummary}
                    className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isLoadingSummary || isStreamingSummary ? 'animate-spin' : ''}`} />
                    <span>
                      {isLoadingSummary || isStreamingSummary
                        ? 'Generating Summary...'
                        : 'Summarize Active Tab'}
                    </span>
                  </button>
                </div>

                {/* Full-width Summary View Extending across Full Side Panel */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <SummaryCard
                    summary={summary}
                    isLoading={isLoadingSummary}
                    isStreaming={isStreamingSummary}
                    streamingChunk={streamingChunk}
                    sourceType={pageMetadata.isYouTube ? 'youtube' : 'article'}
                    sourceTitle={pageMetadata.title}
                    sourceAuthor={pageMetadata.author}
                    sourceUrl={pageMetadata.url}
                    videoId={pageMetadata.videoId}
                    hasTranscript={pageMetadata.hasTranscript}
                    wordCount={pageMetadata.wordCount}
                    readTimeMinutes={pageMetadata.readTimeMinutes}
                    segments={pageMetadata.segments}
                    language={summarizerLang}
                    onLanguageChange={(newLang) => {
                      setSummarizerLang(newLang);
                      handleSummarize(newLang);
                    }}
                    onRefresh={() => handleSummarize()}
                    error={summarizeError}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="h-full flex-1 min-h-0 flex flex-col">
            {!hasApiKey ? (
              <div className="p-4 m-4 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-2">
                <p className="font-medium">Get Started:</p>
                <p className="text-slate-600">
                  Configure your Google Gemini API key to begin chatting with active pages.
                </p>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="mt-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium text-xs hover:bg-indigo-700 transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Configure API Key</span>
                </button>
              </div>
            ) : (
              <ChatView
                context={activePageContext}
                language={settings?.defaultLanguage || 'en'}
                hasTabChanged={hasTabChanged}
                onSyncContext={() => syncWithActiveTab(true)}
                pendingAction={pendingAction}
                onActionHandled={clearPendingAction}
                onOpenScreenshotModal={() => setIsScreenshotModalOpen(true)}
                injectedVisualPair={injectedVisualPair}
                onInjectedVisualHandled={() => setInjectedVisualPair(null)}
              />
            )}
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="h-full flex-1 min-h-0 flex flex-col">
            {!hasApiKey ? (
              <div className="p-4 m-4 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-2">
                <p className="font-medium">Get Started:</p>
                <p className="text-slate-600">
                  Configure your Google Gemini API key to begin using the Agent Pilot.
                </p>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="mt-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium text-xs hover:bg-indigo-700 transition-colors shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Configure API Key</span>
                </button>
              </div>
            ) : (
              <AgentPilot
                context={activePageContext}
                hasTabChanged={hasTabChanged}
                onSyncContext={() => syncWithActiveTab(true)}
                onConfigureApiKey={() => setIsSettingsOpen(true)}
              />
            )}
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <BookmarkCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-medium text-slate-800 text-sm">Saved Skills</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                One-click prompt recipes for studying, drafting responses, and filling profile data.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-indigo-600" />
                  <span>API Credentials</span>
                </h3>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Edit
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Gemini API Key</span>
                  <span className="font-mono text-slate-800">
                    {settings?.geminiApiKey ? '••••••••' + settings.geminiApiKey.slice(-4) : 'Not configured'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Groq Fallback Key</span>
                  <span className="font-mono text-slate-800">
                    {settings?.groqApiKey ? '••••••••' + settings.groqApiKey.slice(-4) : 'None'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-600 flex items-center gap-1">
                    <Languages className="w-3.5 h-3.5 text-slate-400" />
                    <span>Default Language</span>
                  </span>
                  <span className="font-semibold text-slate-800 uppercase">
                    {settings?.defaultLanguage || 'en'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-full mt-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Open Settings Modal</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Status Bar */}
      <footer className="px-3 py-2 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-medium text-slate-600">Local-Only Memory</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
          <span>{hasApiKey ? 'Ready' : 'API Key Needed'}</span>
        </div>
      </footer>

      {/* Settings Modal Component */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={(updated) => {
          setSettings(updated);
        }}
      />

      {/* Visual Inspection Screenshot Modal (Task 2.4) */}
      <ScreenshotModal
        isOpen={isScreenshotModalOpen}
        onClose={() => setIsScreenshotModalOpen(false)}
        pageContext={activePageContext}
        language={settings?.defaultLanguage || 'en'}
        onSendToChat={(question, answer, thumbnail) => {
          setInjectedVisualPair({ question, answer, imageThumbnail: thumbnail });
          setActiveTab('chat');
        }}
      />
    </div>
  );
};

export default App;
