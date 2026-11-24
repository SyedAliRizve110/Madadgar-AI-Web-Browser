import React, { useState, useEffect } from 'react';
import {
  Send,
  Mail,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Linkedin,
  Twitter,
  PenTool,
  X,
} from 'lucide-react';
import { AIGateway } from '@/ai/ai_gateway';
import type { HarvestedPageContext, SupportedLanguage } from '@/common/types';

export interface DraftComposerProps {
  language?: SupportedLanguage;
  onClose?: () => void;
}

export type ComposerTone = 'professional' | 'concise' | 'friendly' | 'engaging';
export type SocialPlatform = 'linkedin' | 'twitter';

export const DraftComposer: React.FC<DraftComposerProps> = ({
  language = 'en',
  onClose,
}) => {
  const [context, setContext] = useState<HarvestedPageContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [tone, setTone] = useState<ComposerTone>('professional');
  const [platform, setPlatform] = useState<SocialPlatform>('linkedin');
  const [userInstructions, setUserInstructions] = useState('');
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInjecting, setIsInjecting] = useState(false);
  const [injectStatus, setInjectStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Harvest page context on mount
  useEffect(() => {
    harvestContext();
  }, []);

  const harvestContext = async () => {
    setIsLoadingContext(true);
    setErrorMessage(null);
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          const res = await chrome.tabs.sendMessage(activeTab.id, {
            type: 'HARVEST_PAGE_CONTEXT',
          });
          if (res?.success && res.context) {
            setContext(res.context);
            // Default tone
            if (res.context.type === 'article') {
              setTone('engaging');
            }
            return;
          }
        }
      }
      // Fallback
      setContext({
        type: 'general',
        url: typeof window !== 'undefined' ? window.location.href : '',
        title: 'Active Tab Context',
      });
    } catch (err: any) {
      console.warn('[DraftComposer] Failed to harvest context:', err);
      setContext({
        type: 'general',
        url: '',
        title: 'Drafting Canvas',
      });
    } finally {
      setIsLoadingContext(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setInjectStatus(null);

    try {
      let prompt = '';
      let systemInstruction = '';

      if (context?.type === 'email') {
        systemInstruction =
          'You are Madadgar, an expert executive communication assistant. Generate context-aware, polished email replies.';
        prompt = `Write a high-quality email reply based on the following thread context:
Sender: ${context.sender || 'Unknown'}
Subject: ${context.subject || 'No Subject'}
Message Content:
${context.fullBody || context.bodySnippet || 'No message body provided.'}

Tone: ${tone}
${userInstructions ? `Specific User Directives: ${userInstructions}` : ''}
${language === 'hinglish' ? 'Language Style: Natural Indian English / conversational Hinglish where appropriate.' : 'Language: Professional English.'}

Provide only the reply body text (with appropriate greeting and sign-off). Do not include markdown meta fences or commentary.`;
      } else {
        // Article or Social Post
        systemInstruction =
          'You are Madadgar, a world-class thought leadership and social content creator. Craft compelling social updates based on articles.';
        if (platform === 'twitter') {
          prompt = `Craft an engaging Twitter/X thread or punchy single tweet (under 280 characters if single) based on this content:
Title: ${context?.title || 'Article'}
Summary/Content:
${context?.bodySnippet || context?.summary || ''}
URL: ${context?.url || ''}

Tone: ${tone}
${userInstructions ? `Key points to highlight: ${userInstructions}` : ''}
Include 2-3 highly relevant hashtags. Return only the tweet text ready to post.`;
        } else {
          prompt = `Craft a thoughtful, engaging LinkedIn post based on this article/insight:
Title: ${context?.title || 'Article'}
Summary/Content:
${context?.bodySnippet || context?.summary || ''}
URL: ${context?.url || ''}

Tone: ${tone}
${userInstructions ? `Key points to emphasize: ${userInstructions}` : ''}
Structure with a captivating hook, clear bulleted insights, actionable takeaway, and 3-4 professional hashtags. Return only the post text ready to publish.`;
        }
      }

      const draft = await AIGateway.complete({
        prompt,
        systemInstruction,
      });

      setGeneratedDraft(draft.trim());
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate draft. Please verify your API key.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInject = async () => {
    if (!generatedDraft.trim()) return;
    setIsInjecting(true);
    setInjectStatus(null);
    setErrorMessage(null);

    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          const res = await chrome.tabs.sendMessage(activeTab.id, {
            type: 'INJECT_DRAFT',
            text: generatedDraft,
            mode: 'replace',
          });

          if (res?.success) {
            setInjectStatus(`Injected into ${res.editorType || 'composer'}!`);
            setTimeout(() => setInjectStatus(null), 3500);
          } else {
            setErrorMessage(res?.error || 'Could not find an active composer on the page.');
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to inject into page composer.');
    } finally {
      setIsInjecting(false);
    }
  };

  const handleCopy = () => {
    if (!generatedDraft) return;
    navigator.clipboard.writeText(generatedDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isEmail = context?.type === 'email';

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 p-4 overflow-y-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          {isEmail ? (
            <Mail className="w-5 h-5 text-indigo-600" />
          ) : (
            <Share2 className="w-5 h-5 text-indigo-600" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              {isEmail ? 'Context-Aware Email Replier' : 'Social Post & Share Drafter'}
            </h2>
            <p className="text-xs text-slate-500">
              {isEmail
                ? 'Synthesizes reply from incoming email thread'
                : 'Transforms page insights into engaging social updates'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={harvestContext}
            disabled={isLoadingContext}
            title="Refresh Page Context"
            className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingContext ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close Drafter"
              className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Context Badge / Card */}
      {context && (
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Detected Context: {isEmail ? 'Email Thread' : 'Article / Page'}</span>
          </div>
          {isEmail ? (
            <div className="text-slate-600 space-y-0.5">
              <p className="truncate">
                <span className="font-semibold text-slate-700">From:</span> {context.sender}
              </p>
              <p className="truncate">
                <span className="font-semibold text-slate-700">Subject:</span> {context.subject}
              </p>
            </div>
          ) : (
            <p className="font-medium text-slate-800 line-clamp-2">{context.title}</p>
          )}
        </div>
      )}

      {/* Configuration Controls */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-3 text-xs">
        {/* Platform selection for Social */}
        {!isEmail && (
          <div>
            <label className="block font-medium text-slate-700 mb-1.5">Destination Platform</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlatform('linkedin')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border font-medium transition-all ${
                  platform === 'linkedin'
                    ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Linkedin className="w-3.5 h-3.5" />
                <span>LinkedIn</span>
              </button>
              <button
                type="button"
                onClick={() => setPlatform('twitter')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border font-medium transition-all ${
                  platform === 'twitter'
                    ? 'bg-sky-50 border-sky-400 text-sky-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Twitter className="w-3.5 h-3.5" />
                <span>Twitter / X</span>
              </button>
            </div>
          </div>
        )}

        {/* Tone Selection */}
        <div>
          <label className="block font-medium text-slate-700 mb-1.5">Tone Persona</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['professional', 'concise', isEmail ? 'friendly' : 'engaging'] as ComposerTone[]).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`py-1 px-2 rounded-md border text-center capitalize transition-all ${
                    tone === t
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t}
                </button>
              )
            )}
          </div>
        </div>

        {/* User Directive Prompt */}
        <div>
          <label className="block font-medium text-slate-700 mb-1">
            {isEmail ? 'Special Guidance / Points to Cover (Optional)' : 'Focus Keywords / Insights (Optional)'}
          </label>
          <input
            type="text"
            value={userInstructions}
            onChange={(e) => setUserInstructions(e.target.value)}
            placeholder={
              isEmail
                ? 'e.g., Politely agree and ask for Friday 3 PM slot'
                : 'e.g., Emphasize AI productivity and student impact'
            }
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || isLoadingContext}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Drafting with AI...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{isEmail ? 'Generate Email Reply' : 'Generate Social Post'}</span>
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Generated Draft Output */}
      {generatedDraft && (
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-slate-700 font-medium">
            <span className="flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5 text-indigo-600" />
              <span>Generated Draft</span>
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {generatedDraft.length} chars
            </span>
          </div>

          <textarea
            rows={7}
            value={generatedDraft}
            onChange={(e) => setGeneratedDraft(e.target.value)}
            className="w-full p-2.5 rounded-md border border-slate-200 font-sans text-slate-800 leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
          />

          {injectStatus && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md font-medium text-center">
              ✓ {injectStatus}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>

            <button
              onClick={handleInject}
              disabled={isInjecting}
              className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isInjecting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Inject into Composer</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
