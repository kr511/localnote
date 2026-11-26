import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, Mic, MicOff, Sparkles, XCircle } from 'lucide-react';
import { api, ApiError } from '../api';
import type { FeynmanFeedback, StudyCard, View } from '../types';

interface Props {
  card: StudyCard;
  onResult: () => void;
  onClose: () => void;
  onNavigate: (v: View) => void;
}

// Minimal typing for the (prefixed) Web Speech API.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const SpeechRecognitionCtor: (new () => Recognition) | undefined =
  (window as unknown as Record<string, unknown>).SpeechRecognition as never ??
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition as never;

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-300 bg-emerald-500/15 ring-emerald-500/30';
  if (score >= 50) return 'text-amber-300 bg-amber-500/15 ring-amber-500/30';
  return 'text-red-300 bg-red-500/15 ring-red-500/30';
}

export default function FeynmanPanel({ card, onResult, onClose, onNavigate }: Props) {
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FeynmanFeedback | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const rec = useRef<Recognition | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ta.current?.focus();
    return () => rec.current?.stop();
  }, []);

  const toggleMic = () => {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new SpeechRecognitionCtor();
    r.lang = 'de-DE';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (finalText) setText((t) => (t ? `${t.trimEnd()} ${finalText.trim()}` : finalText.trim()));
      setInterim(interimText);
    };
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    r.onerror = (e) => setError(new ApiError(0, `Mikrofon-Fehler: ${e.error}`));
    rec.current = r;
    r.start();
    setListening(true);
  };

  const check = async () => {
    if (loading || text.trim().length < 3) return;
    rec.current?.stop();
    setLoading(true);
    setError(null);
    try {
      const fb = await api.feynmanCheck(card.id, text);
      setResult(fb);
      // let 1-4 rate the card right away
      (document.activeElement as HTMLElement | null)?.blur();
      onResult();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, (e as Error).message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-5">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Sparkles size={15} className="text-violet-300" />
        <span className="font-medium text-zinc-100">Frei erklären</span>
        <span className="text-zinc-500">Erklär's so, als würdest du es einem jüngeren Kind beibringen.</span>
        <button className="ml-auto text-xs text-zinc-500 hover:text-zinc-300" onClick={onClose}>
          schließen <kbd className="ml-1">Esc</kbd>
        </button>
      </div>

      {!result && (
        <>
          <div className="relative">
            <textarea
              ref={ta}
              value={text + (interim ? ` ${interim}` : '')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  check();
                }
                if (e.key === 'Escape') onClose();
              }}
              rows={5}
              disabled={loading}
              placeholder="Deine Erklärung in eigenen Worten…"
              className="w-full resize-y rounded-lg bg-zinc-900/80 p-3 text-[15px] leading-relaxed text-zinc-100 outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-violet-500/50 disabled:opacity-60"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            {SpeechRecognitionCtor && (
              <button
                onClick={toggleMic}
                disabled={loading}
                title="Spracheingabe. Achtung: Chrome/Edge schicken die Audiodaten zur Erkennung an ihre Server, das ist nicht lokal."
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ${
                  listening ? 'bg-red-500/15 text-red-300 ring-red-500/40' : 'text-zinc-400 ring-zinc-700 hover:text-zinc-200'
                }`}
              >
                {listening ? <MicOff size={14} /> : <Mic size={14} />}
                {listening ? 'Stopp' : 'Diktieren'}
              </button>
            )}
            <button
              onClick={check}
              disabled={loading || text.trim().length < 3}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? 'Lokale KI denkt nach…' : 'Prüfen'}
              {!loading && <kbd className="border-violet-400/40 bg-violet-700 text-violet-100">Strg Enter</kbd>}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="mt-3 flex gap-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200 ring-1 ring-amber-500/20">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>{error.message}</p>
            {(error.code === 'ollama_offline' || error.code === 'model_missing') && (
              <p className="text-amber-200/70">
                Kein Problem, du kannst ganz normal weiterlernen. Ollama-Adresse und Modell kannst du in den{' '}
                <button className="underline hover:text-amber-100" onClick={() => onNavigate({ type: 'settings' })}>
                  Einstellungen
                </button>{' '}
                ändern.
              </p>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-lg px-3 py-1.5 text-2xl font-semibold tabular-nums ring-1 ${scoreColor(result.score)}`}>
              {result.score} %
            </span>
            <div className="text-sm">
              <p className="text-zinc-200">Verständnis</p>
              <p className="text-xs text-zinc-500">Richtwert von {result.model}, keine Note</p>
            </div>
          </div>
          <blockquote className="border-l-2 border-zinc-700 pl-3 text-sm italic text-zinc-400">{text}</blockquote>
          {result.correct.length > 0 && (
            <List icon={<CheckCircle2 size={15} className="text-emerald-400" />} title="Schon richtig" items={result.correct} />
          )}
          {result.missing.length > 0 && (
            <List icon={<XCircle size={15} className="text-amber-400" />} title="Fehlt oder ungenau" items={result.missing} />
          )}
          {result.question && (
            <div className="flex gap-2 rounded-lg bg-zinc-900/80 p-3 text-sm ring-1 ring-zinc-800">
              <CircleHelp size={15} className="mt-0.5 shrink-0 text-violet-300" />
              <p className="text-zinc-200">{result.question}</p>
            </div>
          )}
          <button
            className="text-xs text-zinc-500 hover:text-zinc-300"
            onClick={() => {
              setResult(null);
              setTimeout(() => ta.current?.focus(), 0);
            }}
          >
            Nochmal erklären
          </button>
        </div>
      )}
    </div>
  );
}

function List({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-200">
        {icon} {title}
      </p>
      <ul className="space-y-1 pl-6 text-sm text-zinc-300">
        {items.map((it, i) => (
          <li key={i} className="list-disc">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
