import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  AlertCircle,
  Languages,
  Camera,
  User,
  PenTool,
  Layers,
} from 'lucide-react';
import { getSettings, getUserProfile } from '@/common/storage_adapter';
import type { AppSettings, SupportedLanguage, ExtractReadabilityResponse, UserProfileMemory, SavedSkill, ContextMenuActionPayload } from '@/common/types';
import { SettingsModal } from './components/SettingsModal';
import { ScreenshotModal } from './components/ScreenshotModal';
import { SummaryCard } from './components/SummaryCard';
import { ChatView } from './components/ChatView';
import { AgentPilot } from './components/AgentPilot';
import { ProfileManager } from './components/ProfileManager';
import { SkillsDrawer } from './components/SkillsDrawer';
import { DraftComposer } from './components/DraftComposer';
import { ComparisonCard } from './components/ComparisonCard';
import { RateLimitBanner } from './components/RateLimitBanner';
import { MadadgarLogo } from './components/MadadgarLogo';
import { VoiceMicButton } from './components/VoiceMicButton';
import { MicrophonePermissionTab } from './components/MicrophonePermissionTab';
import { useTabContext } from './hooks/useTabContext';
import { AIGateway } from '@/ai/ai_gateway';
import { VoiceGateway } from '@/voice/voice_gateway';
import { SpeechSynthesizer, formatSummaryForSpeech } from '@/voice/speech_synthesizer';
import { IntentRouter } from '@/voice/intent_router';
import type { StructuredSummary } from '@/ai/prompts/summarizer';
import { isYouTubeUrl, extractYouTubeVideoId } from '@/content/extractor';
import type { VoiceInputState, VoiceEngineType, TTSPlaybackState } from '@/common/types';


export type TabType = 'summarizer' | 'chat' | 'agent' | 'draft' | 'compare' | 'profile' | 'skills' | 'settings';

export const App: React.FC = () => {
  const isPermissionPage = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('request_mic') === 'true';

  if (isPermissionPage) {
    return <MicrophonePermissionTab />;
  }

  const [activeTab, setActiveTab] = useState<TabType>('summarizer');
  const [killSwitchTriggered, setKillSwitchTriggered] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [injectedVisualPair, setInjectedVisualPair] = useState<{ question: string; answer: string; imageThumbnail?: string } | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileMemory | undefined>(undefined);
  const [skillPendingAction, setSkillPendingAction] = useState<ContextMenuActionPayload | null>(null);
  const [agentInitialGoal, setAgentInitialGoal] = useState<string | null>(null);

  // Task 5.4 & 5.5: Voice Speech STT & Cloud Whisper States
  const [voiceState, setVoiceState] = useState<VoiceInputState>('idle');
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineType>('none');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [liveVoiceTranscript, setLiveVoiceTranscript] = useState<string | null>(null);
  const voiceGatewayRef = useRef<VoiceGateway | null>(null);

  const {
    context: activePageContext,
    hasTabChanged,
    pendingAction,
    voiceToggleTrigger,
    clearPendingAction,
    syncWithActiveTab,
    dismissTabChangeNotification,
  } = useTabContext();

  const handleSummarizeRef = useRef<((lang?: SupportedLanguage) => Promise<void>) | null>(null);
  const handleVoiceTranscriptRef = useRef<(text: string) => void>(() => {});

  const handleToggleVoice = useCallback(() => {
    voiceGatewayRef.current?.toggleListening();
  }, []);

  // Initialize Voice Gateway
  useEffect(() => {
    const gw = new VoiceGateway({
      lang: settings?.defaultLanguage === 'hinglish' ? 'en-IN' : 'en-US',
    });

    gw.onStateChange = (st, details) => {
      setVoiceState(st);
      if (details?.engine) setVoiceEngine(details.engine);
      if (details?.error) setVoiceError(details.error);
      else if (st === 'idle' || st === 'listening') setVoiceError(null);
    };

    gw.onTranscript = (result) => {
      setLiveVoiceTranscript(result.text);
      if (result.isFinal) {
        handleVoiceTranscriptRef.current(result.text);
      }
    };

    gw.onError = (err) => {
      setVoiceError(err.message);
    };

    voiceGatewayRef.current = gw;
    speechSynthesizerRef.current?.registerVoiceGateway(gw);

    return () => {
      gw.abort();
    };
  }, [settings?.defaultLanguage]);

  // Global hotkey Alt+V listener in Side Panel window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        handleToggleVoice();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleVoice]);

  // React to Alt+V triggered via background service worker commands
  useEffect(() => {
    if (voiceToggleTrigger > 0) {
      handleToggleVoice();
    }
  }, [voiceToggleTrigger, handleToggleVoice]);

  // Switch to Chat tab when a context menu action (Explain, Translate, Draft) is triggered
  useEffect(() => {
    if (pendingAction) {
      setActiveTab('chat');
    }
  }, [pendingAction]);

  const handleRunSkill = (skill: SavedSkill) => {
    if (skill.targetTab === 'agent' || skill.category === 'forms' || (skill as any).category === 'form') {
      setAgentInitialGoal(skill.promptTemplate);
      setActiveTab('agent');
    } else {
      setSkillPendingAction({
        actionId: 'custom',
        prompt: skill.promptTemplate,
        selectedText: '',
        timestamp: Date.now(),
      });
      setActiveTab('chat');
    }
  };


  const [summary, setSummary] = useState<StructuredSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isStreamingSummary, setIsStreamingSummary] = useState(false);
  const [streamingChunk, setStreamingChunk] = useState('');
  const [summarizerLang, setSummarizerLang] = useState<SupportedLanguage>('en');
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  // Tasks 5.6 & 5.7: Bilingual Text-to-Speech Engine & Audio Briefing States
  const [ttsState, setTtsState] = useState<TTSPlaybackState>('idle');
  const [ttsRate, setTtsRate] = useState<number>(1.0);
  const speechSynthesizerRef = useRef<SpeechSynthesizer | null>(null);
  const pendingAudioBriefingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      speechSynthesizerRef.current?.stop();
    };
  }, []);

  const handlePlayAudioBriefing = useCallback(
    (targetSummary?: StructuredSummary | null, langToUse?: SupportedLanguage) => {
      const sum = targetSummary || summary;
      if (!sum) return;

      const lang = langToUse || summarizerLang;
      if (!speechSynthesizerRef.current) {
        speechSynthesizerRef.current = new SpeechSynthesizer({
          lang,
          rate: ttsRate,
          gateway: voiceGatewayRef.current || undefined,
        });
        speechSynthesizerRef.current.onStateChange = (st) => setTtsState(st);
      } else {
        speechSynthesizerRef.current.registerVoiceGateway(voiceGatewayRef.current);
        speechSynthesizerRef.current.setLanguage(lang);
      }

      const spoken = formatSummaryForSpeech(sum, lang);
      speechSynthesizerRef.current
        .speak(spoken, { lang, rate: ttsRate })
        .catch((err) => console.warn('[App] Spoken audio briefing error:', err));
    },
    [summary, summarizerLang, ttsRate]
  );

  const handlePauseAudioBriefing = useCallback(() => {
    speechSynthesizerRef.current?.pause();
  }, []);

  const handleStopAudioBriefing = useCallback(() => {
    speechSynthesizerRef.current?.stop();
  }, []);

  const handleTtsRateChange = useCallback((rate: number) => {
    setTtsRate(rate);
    speechSynthesizerRef.current?.setRate(rate);
  }, []);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      const intent = IntentRouter.parse(text, settings?.defaultLanguage || 'en');

      if (intent.type === 'STOP_SPEAKING') {
        speechSynthesizerRef.current?.stop();
        setLiveVoiceTranscript('Stopped audio playback');
      } else if (intent.type === 'PAUSE_SPEAKING') {
        speechSynthesizerRef.current?.pause();
        setLiveVoiceTranscript('Paused audio');
      } else if (intent.type === 'RESUME_SPEAKING') {
        speechSynthesizerRef.current?.resume();
        setLiveVoiceTranscript('Resumed audio');
      } else if (intent.type === 'NAVIGATE_SCROLL') {
        setLiveVoiceTranscript(`Scrolling ${intent.scrollDirection || 'down'}`);
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeId = tabs[0]?.id;
            if (activeId) {
              chrome.tabs.sendMessage(activeId, {
                type: 'EXECUTE_SCROLL',
                direction: intent.scrollDirection || 'down',
              });
            }
          });
        }
      } else if (intent.type === 'CLICK_BADGE') {
        setLiveVoiceTranscript(`Clicking badge #${intent.badgeNumber}`);
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeId = tabs[0]?.id;
            if (activeId && intent.badgeNumber !== undefined) {
              chrome.tabs.sendMessage(activeId, {
                type: 'CLICK_BADGE',
                badgeNumber: intent.badgeNumber,
              });
            }
          });
        }
      } else if (intent.type === 'CLICK_ELEMENT_TEXT') {
        setLiveVoiceTranscript(`Clicking "${intent.targetText}"`);
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeId = tabs[0]?.id;
            if (activeId && intent.targetText) {
              chrome.tabs.sendMessage(activeId, {
                type: 'CLICK_ELEMENT_TEXT',
                targetText: intent.targetText,
              });
            }
          });
        }
      } else if (intent.type === 'BROWSER_NAVIGATION') {
        setLiveVoiceTranscript(`Browser navigation: ${intent.browserNav}`);
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeId = tabs[0]?.id;
            if (activeId) {
              if (intent.browserNav === 'back') chrome.tabs.goBack(activeId).catch(() => {});
              else if (intent.browserNav === 'forward') chrome.tabs.goForward(activeId).catch(() => {});
              else if (intent.browserNav === 'reload') chrome.tabs.reload(activeId).catch(() => {});
            }
          });
        }
      } else if (intent.type === 'TASK_CONTROL') {
        setLiveVoiceTranscript(`Task command: ${intent.taskControl}`);
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          if (intent.taskControl === 'approve') {
            chrome.runtime.sendMessage({ type: 'APPROVE_AGENT_STEP' });
          } else if (intent.taskControl === 'skip') {
            chrome.runtime.sendMessage({ type: 'SKIP_AGENT_STEP' });
          } else if (intent.taskControl === 'cancel') {
            chrome.runtime.sendMessage({ type: 'STOP_AGENT_TASK', reason: 'Spoken voice cancellation' });
          } else if (intent.taskControl === 'undo') {
            chrome.runtime.sendMessage({ type: 'UNDO_LAST_ACTION' });
          }
        }
      } else if (intent.type === 'READ_ALOUD_SUMMARY') {
        setActiveTab('summarizer');
        handlePlayAudioBriefing();
        setLiveVoiceTranscript('Reading summary aloud...');
      } else if (intent.type === 'SUMMARIZE_PAGE') {
        setActiveTab('summarizer');
        const targetLang = intent.language || summarizerLang;
        if (intent.language) {
          setSummarizerLang(intent.language);
        }
        if (intent.audioBriefingRequested) {
          pendingAudioBriefingRef.current = true;
          setLiveVoiceTranscript('Summarizing page for audio briefing...');
        } else {
          setLiveVoiceTranscript('Summarizing page...');
        }
        handleSummarizeRef.current?.(targetLang);
      } else if (activeTab === 'agent') {
        setAgentInitialGoal(intent.cleanedText || text);
      } else {
        setSkillPendingAction({
          actionId: 'voice',
          prompt: intent.cleanedText || text,
          selectedText: '',
          timestamp: Date.now(),
        });
        setActiveTab('chat');
      }

      setTimeout(() => {
        setLiveVoiceTranscript(null);
      }, 4000);
    },
    [activeTab, settings?.defaultLanguage, summarizerLang, handlePlayAudioBriefing]
  );

  handleVoiceTranscriptRef.current = handleVoiceTranscript;
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
    getUserProfile().then((p) => {
      setUserProfile(p);
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
      if (pendingAudioBriefingRef.current) {
        pendingAudioBriefingRef.current = false;
        handlePlayAudioBriefing(result, lang);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSummarizeError(errorMsg);
    } finally {
      setIsLoadingSummary(false);
      setIsStreamingSummary(false);
    }
  };
  handleSummarizeRef.current = handleSummarize;


  const handleKillSwitch = () => {
    setKillSwitchTriggered(true);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { type: 'EMERGENCY_KILL_SWITCH', reason: 'Emergency kill switch triggered by user.' },
        () => {}
      );
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'EMERGENCY_KILL_SWITCH' }, () => {});
        }
      }).catch(() => {});
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
          {/* Task 5.4: Voice Push-to-Talk Mic Button */}
          <VoiceMicButton
            state={voiceState}
            activeEngine={voiceEngine}
            errorMessage={voiceError}
            onToggle={handleToggleVoice}
            size="sm"
          />

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

      {/* Voice Error / Microphone Permission Banner */}
      {voiceError && (
        <div className="mx-3 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate">{voiceError}</span>
          </div>
          <button
            onClick={() => VoiceGateway.openPermissionTab()}
            className="shrink-0 px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-medium cursor-pointer"
          >
            Grant Access
          </button>
        </div>
      )}

      {/* Task 5.4: Live Voice Listening / Transcript Bar */}
      {(voiceState === 'listening' || voiceState === 'recording' || voiceState === 'processing' || liveVoiceTranscript) && (
        <div className="px-3 py-1.5 bg-indigo-50/95 border-b border-indigo-200 flex items-center justify-between text-xs text-indigo-900 animate-fadeIn">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="truncate text-[11px] font-medium">
              {voiceState === 'processing'
                ? 'Transcribing audio with Groq Whisper...'
                : liveVoiceTranscript
                  ? `"${liveVoiceTranscript}"`
                  : voiceEngine === 'cloud-whisper'
                    ? 'Recording audio for Whisper... (Click to finish)'
                    : 'Listening... Speak command or prompt (Alt+V)'}
            </span>
          </div>
          <button
            onClick={() => voiceGatewayRef.current?.abort()}
            className="text-[10px] text-slate-500 hover:text-slate-800 px-1 cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Active Tab / Window Switch Sync Banner (Task 5.2) */}
      {hasTabChanged && (
        <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between text-xs text-indigo-900 animate-fadeIn">
          <div className="flex items-center space-x-1.5 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="truncate text-[11px]">
              Switched tab or window. Sync context with active page?
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
          onClick={() => setActiveTab('draft')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'draft'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
          title="Email & Social Drafter"
        >
          <PenTool className="w-3.5 h-3.5" />
          <span>Draft</span>
        </button>

        <button
          onClick={() => setActiveTab('compare')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'compare'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
          title="Cross-Tab Comparison Engine"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Compare</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-colors ${
            activeTab === 'profile'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
          title="Local Profile Memory"
        >
          <User className="w-3.5 h-3.5" />
          <span>Profile</span>
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
                    ttsState={ttsState}
                    ttsRate={ttsRate}
                    onPlayAudioBriefing={() => handlePlayAudioBriefing()}
                    onPauseAudioBriefing={() => handlePauseAudioBriefing()}
                    onStopAudioBriefing={() => handleStopAudioBriefing()}
                    onRateChange={(r) => handleTtsRateChange(r)}
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
                pendingAction={skillPendingAction || pendingAction}
                onActionHandled={() => {
                  if (skillPendingAction) {
                    setSkillPendingAction(null);
                  } else {
                    clearPendingAction();
                  }
                }}
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
                profileMemory={userProfile}
                hasTabChanged={hasTabChanged}
                onSyncContext={() => syncWithActiveTab(true)}
                onConfigureApiKey={() => setIsSettingsOpen(true)}
                initialGoal={agentInitialGoal || undefined}
                onInitialGoalHandled={() => setAgentInitialGoal(null)}
              />
            )}
          </div>
        )}

        {activeTab === 'draft' && (
          <div className="h-full flex-1 min-h-0 flex flex-col">
            <DraftComposer
              language={settings?.defaultLanguage || 'en'}
              onClose={() => setActiveTab('summarizer')}
            />
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="h-full flex-1 min-h-0 flex flex-col">
            <ComparisonCard onClose={() => setActiveTab('summarizer')} />
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="h-full flex-1 min-h-0 flex flex-col">
            <ProfileManager
              onProfileUpdated={(updated) => setUserProfile(updated)}
            />
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="h-full flex-1 min-h-0 flex flex-col">
            <SkillsDrawer
              onRunSkill={handleRunSkill}
              onNavigateTab={(tab) => setActiveTab(tab)}
              activeProfile={userProfile}
            />
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
                className="w-full mt-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Open Settings Modal</span>
              </button>
            </div>

            {/* Profile Memory Summary Card */}
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span>Profile Memory</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  Manage
                </button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Store your personal, academic, and professional details locally for safe, one-click form filling during errands.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Open Profile Manager</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Status Bar */}
      <footer className="px-3 py-2 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className="flex items-center space-x-1.5 hover:text-indigo-600 transition-colors cursor-pointer"
          title="Open Profile Memory"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-medium text-slate-600 hover:text-indigo-600">Local-Only Memory</span>
        </button>
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
