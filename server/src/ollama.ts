import type { DB } from './db.js';
import { HttpError } from './http.js';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b';
const STATUS_TIMEOUT_MS = 2_500;
export const CHAT_TIMEOUT_MS = 120_000;

export type Source = 'db' | 'env' | 'default';

export interface OllamaConfig {
  url: string;
  model: string;
  urlSource: Source;
  modelSource: Source;
}

export function getSetting(db: DB, key: string): string | undefined {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}

export function setSetting(db: DB, key: string, value: string | null) {
  if (value === null || value === '') db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  else
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      key,
      value,
    );
}

function resolve(db: DB, key: string, env: string | undefined, fallback: string): [string, Source] {
  const fromDb = getSetting(db, key);
  if (fromDb) return [fromDb, 'db'];
  if (env) return [env, 'env'];
  return [fallback, 'default'];
}

export function getOllamaConfig(db: DB): OllamaConfig {
  const [url, urlSource] = resolve(db, 'ollama_url', process.env.OLLAMA_URL, DEFAULT_OLLAMA_URL);
  const [model, modelSource] = resolve(db, 'ollama_model', process.env.OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL);
  return { url: url.replace(/\/+$/, ''), model, urlSource, modelSource };
}

export function isValidOllamaUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const offline = (url: string) =>
  new HttpError(
    503,
    `Ollama ist gerade nicht erreichbar (${url}). Starte Ollama (App öffnen oder "ollama serve" im Terminal) und versuch es nochmal.`,
    'ollama_offline',
  );

async function call(url: string, init: RequestInit, timeoutMs: number, baseUrl: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new HttpError(
        504,
        'Ollama hat zu lange gebraucht. Beim ersten Aufruf lädt das Modell, versuch es gleich nochmal oder nimm ein kleineres Modell.',
        'ollama_timeout',
      );
    }
    throw offline(baseUrl);
  }
}

export interface OllamaStatus {
  available: boolean;
  url: string;
  model: string;
  modelInstalled: boolean;
  models: string[];
  message?: string;
}

/** Matches "qwen2.5:7b" against installed names; "llama3.2" also matches "llama3.2:latest". */
export function modelMatches(wanted: string, installed: string): boolean {
  if (wanted === installed) return true;
  if (!wanted.includes(':')) return installed === `${wanted}:latest`;
  return false;
}

export async function ollamaStatus(cfg: OllamaConfig): Promise<OllamaStatus> {
  const base = { url: cfg.url, model: cfg.model, models: [] as string[], modelInstalled: false };
  try {
    const res = await call(`${cfg.url}/api/tags`, {}, STATUS_TIMEOUT_MS, cfg.url);
    if (!res.ok) return { ...base, available: false, message: `Ollama antwortet mit Status ${res.status}.` };
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name).sort();
    return { ...base, available: true, models, modelInstalled: models.some((m) => modelMatches(cfg.model, m)) };
  } catch (e) {
    return { ...base, available: false, message: (e as Error).message };
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Non-streaming chat with structured (JSON schema) output. Returns the raw content string. */
export async function ollamaChat(cfg: OllamaConfig, messages: ChatMessage[], format: object): Promise<string> {
  const res = await call(
    `${cfg.url}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages, stream: false, format, options: { temperature: 0.2 } }),
    },
    CHAT_TIMEOUT_MS,
    cfg.url,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404 || /not found|pull/i.test(text)) {
      throw new HttpError(
        503,
        `Das Modell "${cfg.model}" ist in Ollama nicht installiert. Hol es dir mit: ollama pull ${cfg.model}`,
        'model_missing',
      );
    }
    throw new HttpError(502, `Ollama-Fehler (${res.status}): ${text.slice(0, 200)}`, 'ollama_bad_response');
  }
  const data = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
  const content = data?.message?.content;
  if (typeof content !== 'string') throw new HttpError(502, 'Ollama hat eine leere Antwort geschickt.', 'ollama_bad_response');
  return content;
}
