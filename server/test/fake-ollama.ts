import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeOllama {
  url: string;
  requests: { path: string; body: any }[];
  /** what /api/chat returns next: content string, or {status, text} for an error */
  reply: string | { status: number; text: string };
  models: string[];
  close: () => Promise<void>;
}

/** Minimal stand-in for the Ollama REST API, enough for /api/tags and /api/chat. */
export async function startFakeOllama(): Promise<FakeOllama> {
  const state: FakeOllama = {
    url: '',
    requests: [],
    reply: JSON.stringify({ score: 70, correct: ['a'], missing: ['b'], question: 'c?' }),
    models: ['qwen2.5:7b', 'llama3.2:latest'],
    close: async () => {},
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      state.requests.push({ path: req.url ?? '', body: raw ? JSON.parse(raw) : null });
      if (req.url === '/api/tags') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ models: state.models.map((name) => ({ name })) }));
        return;
      }
      if (req.url === '/api/chat') {
        if (typeof state.reply !== 'string') {
          res.statusCode = state.reply.status;
          res.end(state.reply.text);
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: { role: 'assistant', content: state.reply }, done: true }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise((r) => server.close(() => r()));
  return state;
}

/** A URL where nothing listens. */
export async function deadUrl(): Promise<string> {
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((r) => server.close(() => r()));
  return `http://127.0.0.1:${port}`;
}
