import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Languages,
  Sparkles,
} from 'lucide-react';
import { getSettings, saveSettings, getDevEnvGeminiKey, getDevEnvGroqKey } from '@/common/storage_adapter';
import { validateGeminiApiKey, validateGroqApiKey } from '@/common/api_validator';
import type { AppSettings, SupportedLanguage } from '@/common/types';
import { MadadgarLogo } from './MadadgarLogo';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: AppSettings) => void;
}

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('en');

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);

  const [geminiStatus, setGeminiStatus] = useState<ValidationStatus>('idle');
  const [geminiError, setGeminiError] = useState<string | null>(null);

  const [groqStatus, setGroqStatus] = useState<ValidationStatus>('idle');
  const [groqError, setGroqError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load existing settings on open
  useEffect(() => {
    if (isOpen) {
      setSaveSuccess(false);
      getSettings().then((settings) => {
        setGeminiKey(settings.geminiApiKey || '');
        setGroqKey(settings.groqApiKey || '');
        setLanguage(settings.defaultLanguage || 'en');
        if (settings.geminiApiKey) {
          setGeminiStatus('idle');
        }
      });
    }
  }, [isOpen]);

  const handleTestGemini = async () => {
    if (!geminiKey.trim()) {
      setGeminiStatus('invalid');
      setGeminiError('Please enter a Gemini API key');
      return;
    }
    setGeminiStatus('validating');
    setGeminiError(null);
    const result = await validateGeminiApiKey(geminiKey);
    if (result.valid) {
      setGeminiStatus('valid');
      setGeminiError(null);
    } else {
      setGeminiStatus('invalid');
      setGeminiError(result.error || 'Failed to validate key');
    }
  };

  const handleTestGroq = async () => {
    if (!groqKey.trim()) {
      setGroqStatus('invalid');
      setGroqError('Please enter a Groq API key');
      return;
    }
    setGroqStatus('validating');
    setGroqError(null);
    const result = await validateGroqApiKey(groqKey);
    if (result.valid) {
      setGroqStatus('valid');
      setGroqError(null);
    } else {
      setGroqStatus('invalid');
      setGroqError(result.error || 'Failed to validate key');
    }
  };

  const handleUseEnvKey = () => {
    const devKey = getDevEnvGeminiKey();
    if (devKey) {
      setGeminiKey(devKey);
      setGeminiStatus('idle');
      setGeminiError(null);
    }
  };

  const handleUseEnvGroqKey = () => {
    const devKey = getDevEnvGroqKey();
    if (devKey) {
      setGroqKey(devKey);
      setGroqStatus('idle');
      setGroqError(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Validate Gemini key if user hasn't tested it yet and a key is entered
      if (geminiKey.trim() && geminiStatus !== 'valid') {
        setGeminiStatus('validating');
        const check = await validateGeminiApiKey(geminiKey);
        if (!check.valid) {
          setGeminiStatus('invalid');
          setGeminiError(check.error || 'Invalid Gemini API key');
          setIsSaving(false);
          return;
        }
        setGeminiStatus('valid');
      }

      const updatedSettings: AppSettings = {
        geminiApiKey: geminiKey.trim(),
        groqApiKey: groqKey.trim() || undefined,
        defaultLanguage: language,
      };

      await saveSettings(updatedSettings);
      setSaveSuccess(true);
      if (onSaved) {
        onSaved(updatedSettings);
      }
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const hasEnvKey = !!getDevEnvGeminiKey();
  const hasEnvGroqKey = !!getDevEnvGroqKey();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-3 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="shrink-0 drop-shadow-xs">
              <MadadgarLogo className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Settings & API Keys</h2>
              <p className="text-[11px] text-slate-500">Configure your local AI credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Gemini API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Google Gemini API Key</span>
                <span className="text-red-500 font-bold">*</span>
              </label>
              {hasEnvKey && (
                <button
                  type="button"
                  onClick={handleUseEnvKey}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Load from .env</span>
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  setGeminiStatus('idle');
                  setGeminiError(null);
                }}
                placeholder="AIzaSy... or AQ..."
                className={`w-full pr-20 pl-3 py-2 rounded-lg border text-xs outline-none transition-all font-mono ${
                  geminiStatus === 'valid'
                    ? 'border-emerald-300 bg-emerald-50/20 focus:border-emerald-500'
                    : geminiStatus === 'invalid'
                    ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                    : 'border-slate-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                }`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                  title={showGeminiKey ? 'Hide key' : 'Show key'}
                >
                  {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleTestGemini}
                  disabled={geminiStatus === 'validating' || !geminiKey.trim()}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-[11px] font-medium text-slate-700 rounded transition-colors"
                >
                  {geminiStatus === 'validating' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    'Verify'
                  )}
                </button>
              </div>
            </div>

            {/* Validation State Feedback */}
            {geminiStatus === 'valid' && (
              <p className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>API Key verified successfully (Gemini REST ready).</span>
              </p>
            )}
            {geminiStatus === 'invalid' && (
              <p className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{geminiError || 'Invalid API Key'}</span>
              </p>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>Required for Flash-Lite summaries & page chat.</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
              >
                <span>Get free key</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Groq API Key (Optional Fallback) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Groq API Key</span>
                <span className="text-[10px] font-normal text-slate-400">(Optional Fallback)</span>
              </label>
              {hasEnvGroqKey && (
                <button
                  type="button"
                  onClick={handleUseEnvGroqKey}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Load from .env</span>
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type={showGroqKey ? 'text' : 'password'}
                value={groqKey}
                onChange={(e) => {
                  setGroqKey(e.target.value);
                  setGroqStatus('idle');
                  setGroqError(null);
                }}
                placeholder="gsk_..."
                className={`w-full pr-20 pl-3 py-2 rounded-lg border text-xs outline-none transition-all font-mono ${
                  groqStatus === 'valid'
                    ? 'border-emerald-300 bg-emerald-50/20 focus:border-emerald-500'
                    : groqStatus === 'invalid'
                    ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                    : 'border-slate-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
                }`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setShowGroqKey(!showGroqKey)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                  title={showGroqKey ? 'Hide key' : 'Show key'}
                >
                  {showGroqKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleTestGroq}
                  disabled={groqStatus === 'validating' || !groqKey.trim()}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-[11px] font-medium text-slate-700 rounded transition-colors"
                >
                  {groqStatus === 'validating' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    'Verify'
                  )}
                </button>
              </div>
            </div>

            {groqStatus === 'valid' && (
              <p className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Groq API Key verified successfully.</span>
              </p>
            )}
            {groqStatus === 'invalid' && (
              <p className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{groqError || 'Invalid Groq Key'}</span>
              </p>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>Automatic failover during HTTP 429 rate limits.</span>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
              >
                <span>Get Groq key</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Language Preference */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-indigo-600" />
              <span>Preferred Default Language</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  language === 'en'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>English</span>
                  {language === 'en' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Standard concise summaries & answers</p>
              </button>

              <button
                type="button"
                onClick={() => setLanguage('hinglish')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  language === 'hinglish'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>Hinglish</span>
                  {language === 'hinglish' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Conversational Hindi in Roman script</p>
              </button>
            </div>
          </div>

          {/* Privacy Guarantee Box */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-900 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Local-First & Telemetry-Free</span>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">
              API keys and profile preferences are persisted exclusively inside your browser's local storage (
              <code className="text-[9px] bg-slate-200/70 px-1 py-0.5 rounded">chrome.storage.local</code>
              ). No third-party analytical servers or telemetry endpoints are ever called.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            {saveSuccess && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 animate-pulse">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Settings saved!</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-medium text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-xs shadow-sm transition-colors flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

