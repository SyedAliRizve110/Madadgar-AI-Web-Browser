import React, { useState } from 'react';
import { Mic, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export const MicrophonePermissionTab: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRequestPermission = async () => {
    setStatus('requesting');
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setStatus('granted');

      // Auto close after 2.5 seconds once granted
      setTimeout(() => {
        window.close();
      }, 2500);
    } catch (err: any) {
      console.warn('[MicrophonePermissionTab] Microphone permission request failed:', err);
      setStatus('denied');
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Microphone permission was dismissed or blocked. Click the microphone/lock icon in your browser address bar above to allow it.'
          : err.message || 'Failed to access microphone hardware.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 text-center">
        {status === 'granted' ? (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Microphone Access Enabled!</h2>
            <p className="text-sm text-slate-600">
              Madadgar can now listen to your voice commands and <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Alt+V</kbd> shortcuts in the Side Panel.
            </p>
            <p className="text-xs text-slate-400">Closing this tab automatically in 2 seconds...</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="w-16 h-16 mx-auto bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center ring-8 ring-indigo-50/50">
              <Mic className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-900">Enable Microphone for Madadgar</h1>
              <p className="text-sm text-slate-600">
                To use the Push-to-Talk shortcut (<kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Alt+V</kbd>) and voice features, please grant microphone access to the extension.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-slate-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Local & Private Voice Processing</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Your voice is processed on-device via Web Speech API and never stored or shared without your permission.
              </p>
            </div>

            {status === 'denied' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left flex items-start gap-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Microphone Blocked</p>
                  <p className="text-[11px] mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleRequestPermission}
              disabled={status === 'requesting'}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Mic className="w-4 h-4" />
              <span>{status === 'requesting' ? 'Requesting Permission...' : 'Allow Microphone Access'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
