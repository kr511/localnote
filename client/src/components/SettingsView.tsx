import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react';
import { api } from '../api';
import type { OllamaStatus, Settings } from '../types';

const SOURCE_LABEL = { db: 'in der App gesetzt', env: 'aus Umgebungsvariable', default: 'Standard' } as const;

export default function SettingsView({ onError }: { onError: (msg: string) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [url, setUrl] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      setStatus(await api.feynmanStatus());
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setSettings(s);
        setUrl(s.ollamaUrl);
        setModel(s.ollamaModel);
      })
      .catch((e) => onError(e.message));
    test();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (patch: { ollamaUrl?: string; ollamaModel?: string }) => {
    try {
      const s = await api.saveSettings(patch);
      setSettings(s);
      setUrl(s.ollamaUrl);
      setModel(s.ollamaModel);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      await test();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const input = 'w-full rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700/60 focus:ring-violet-500/60';

  return (
    <div className="mx-auto max-w-2xl px-10 pb-16 pt-12">
      <h1 className="mb-8 text-xl font-semibold tracking-tight text-zinc-50">Einstellungen</h1>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="flex items-center gap-2 font-medium text-zinc-100">
          <PlugZap size={16} className="text-violet-400" /> Lokale KI (Ollama) für den Feynman-Check
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Läuft komplett auf deinem Rechner. Installier <span className="text-zinc-300">Ollama</span> von ollama.com und lade ein Modell, z. B.{' '}
          <code className="rounded bg-zinc-800 px-1 text-zinc-300">ollama pull qwen2.5:7b</code>.
        </p>

        {settings && (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save({ ollamaUrl: url, ollamaModel: model });
            }}
          >
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Adresse · {SOURCE_LABEL[settings.ollamaUrlSource]}</span>
              <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">Modell · {SOURCE_LABEL[settings.ollamaModelSource]}</span>
              <input className={input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen2.5:7b" />
            </label>
            <div className="flex items-center gap-2">
              <button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">Speichern</button>
              <button type="button" onClick={test} className="rounded-lg px-3 py-2 text-sm text-zinc-400 ring-1 ring-zinc-700 hover:text-zinc-200">
                Verbindung testen
              </button>
              <button
                type="button"
                onClick={() => save({ ollamaUrl: '', ollamaModel: '' })}
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
              >
                Auf Standard zurücksetzen
              </button>
              {saved && <span className="text-xs text-emerald-400">Gespeichert</span>}
            </div>
          </form>
        )}

        <div className="mt-5 rounded-lg bg-zinc-800/40 p-3 text-sm">
          {testing && (
            <p className="flex items-center gap-2 text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> Prüfe Verbindung…
            </p>
          )}
          {!testing && status && !status.available && (
            <p className="flex items-start gap-2 text-amber-200">
              <XCircle size={15} className="mt-0.5 shrink-0" /> Ollama ist unter {status.url} nicht erreichbar. Läuft die Ollama-App bzw.{' '}
              <code>ollama serve</code>?
            </p>
          )}
          {!testing && status?.available && (
            <div className="space-y-2">
              <p className={`flex items-center gap-2 ${status.modelInstalled ? 'text-emerald-300' : 'text-amber-200'}`}>
                {status.modelInstalled ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                {status.modelInstalled
                  ? `Verbunden, Modell "${status.model}" ist bereit.`
                  : `Verbunden, aber "${status.model}" ist nicht installiert: ollama pull ${status.model}`}
              </p>
              {status.models.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-zinc-500">Installiert:</span>
                  {status.models.map((m) => (
                    <button
                      key={m}
                      onClick={() => save({ ollamaModel: m })}
                      className={`rounded-full px-2 py-0.5 text-xs ring-1 ${
                        m === status.model ? 'bg-violet-500/20 text-violet-200 ring-violet-500/40' : 'text-zinc-400 ring-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
