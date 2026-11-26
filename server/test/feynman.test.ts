import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { block, setup } from './helpers.js';
import { deadUrl, startFakeOllama, type FakeOllama } from './fake-ollama.js';
import { parseFeedback } from '../src/feynman.js';
import { modelMatches } from '../src/ollama.js';

let ollama: FakeOllama;
beforeAll(async () => {
  ollama = await startFakeOllama();
});
afterAll(() => ollama.close());

async function seed(url = ollama.url) {
  const ctx = setup();
  await ctx.api.put('/api/settings').send({ ollamaUrl: url, ollamaModel: 'qwen2.5:7b' }).expect(200);
  const s = (await ctx.api.post('/api/subjects').send({ name: 'Bio' })).body;
  const p = (await ctx.api.post('/api/pages').send({ subjectId: s.id, title: 'Herz' })).body;
  await ctx.api.put(`/api/pages/${p.id}/blocks`).send({
    blocks: [
      block('Herzkreislauf'),
      block('Was macht das Herz? >> Es pumpt Blut durch den Körper', 1),
      block('Lungenkreislauf und Körperkreislauf', 2),
      block('Anderes Thema', 0),
    ],
  });
  const cardId = (ctx.db.prepare('SELECT id FROM cards').get() as { id: number }).id;
  return { ...ctx, cardId };
}

describe('Einstellungen', () => {
  it('speichert, validiert und setzt zurück', async () => {
    const { api } = setup();
    const def = (await api.get('/api/settings').expect(200)).body;
    expect(def.ollamaModelSource).not.toBe('db');
    await api.put('/api/settings').send({ ollamaUrl: 'ftp://x' }).expect(400);
    const set = (await api.put('/api/settings').send({ ollamaUrl: 'http://localhost:1234/', ollamaModel: 'llama3.2' })).body;
    expect(set).toMatchObject({ ollamaUrl: 'http://localhost:1234', ollamaModel: 'llama3.2', ollamaUrlSource: 'db' });
    const reset = (await api.put('/api/settings').send({ ollamaModel: '' })).body;
    expect(reset.ollamaModelSource).not.toBe('db');
  });
});

describe('Feynman-Check', () => {
  it('meldet Status und installierte Modelle', async () => {
    const { api } = await seed();
    const st = (await api.get('/api/feynman/status').expect(200)).body;
    expect(st).toMatchObject({ available: true, modelInstalled: true, model: 'qwen2.5:7b' });
    expect(modelMatches('llama3.2', 'llama3.2:latest')).toBe(true);
    expect(modelMatches('llama3.2', 'llama3.2:1b')).toBe(false);
  });

  it('bewertet eine Erklärung mit Kontext und speichert den Versuch', async () => {
    const { api, db, cardId } = await seed();
    ollama.reply = JSON.stringify({
      score: 140,
      correct: ['Pumpt Blut', ''],
      missing: ['Zwei Kreisläufe nicht erwähnt'],
      question: 'Welche zwei Kreisläufe gibt es?',
    });
    const res = (
      await api.post('/api/feynman/check').send({ cardId, explanation: 'Das Herz ist eine Pumpe für Blut.' }).expect(200)
    ).body;
    expect(res).toEqual({
      score: 100,
      correct: ['Pumpt Blut'],
      missing: ['Zwei Kreisläufe nicht erwähnt'],
      question: 'Welche zwei Kreisläufe gibt es?',
      model: 'qwen2.5:7b',
    });

    const req = ollama.requests.filter((r) => r.path === '/api/chat').at(-1)!.body;
    expect(req).toMatchObject({ model: 'qwen2.5:7b', stream: false });
    expect(req.format.required).toEqual(['score', 'correct', 'missing', 'question']);
    const user = req.messages[1].content as string;
    expect(user).toContain('Musterlösung: Es pumpt Blut durch den Körper');
    expect(user).toContain('- Herzkreislauf'); // Elternblock
    expect(user).toContain('Lungenkreislauf und Körperkreislauf'); // Unterpunkt
    expect(user).not.toContain('Anderes Thema');
    expect(user).toContain('<erklaerung>\nDas Herz ist eine Pumpe für Blut.\n</erklaerung>');

    expect(db.prepare('SELECT card_id, score, model FROM feynman_attempts').all()).toEqual([
      { card_id: cardId, score: 100, model: 'qwen2.5:7b' },
    ]);
  });

  it('meldet freundlich, wenn Ollama nicht läuft', async () => {
    const { api, cardId } = await seed(await deadUrl());
    const res = await api.post('/api/feynman/check').send({ cardId, explanation: 'irgendwas' }).expect(503);
    expect(res.body.code).toBe('ollama_offline');
    expect(res.body.error).toMatch(/nicht erreichbar/);
    const st = (await api.get('/api/feynman/status').expect(200)).body;
    expect(st.available).toBe(false);
  });

  it('meldet fehlendes Modell und kaputte Antworten', async () => {
    const { api, cardId } = await seed();
    ollama.reply = { status: 404, text: '{"error":"model \\"qwen2.5:7b\\" not found, try pulling it first"}' };
    const missing = await api.post('/api/feynman/check').send({ cardId, explanation: 'abc def' }).expect(503);
    expect(missing.body).toMatchObject({ code: 'model_missing' });
    expect(missing.body.error).toContain('ollama pull qwen2.5:7b');

    ollama.reply = 'Ich bin kein JSON';
    const bad = await api.post('/api/feynman/check').send({ cardId, explanation: 'abc def' }).expect(502);
    expect(bad.body.code).toBe('ollama_bad_response');
  });

  it('validiert Eingaben', async () => {
    const { api, cardId } = await seed();
    await api.post('/api/feynman/check').send({ cardId, explanation: '' }).expect(400);
    await api.post('/api/feynman/check').send({ explanation: 'abc' }).expect(400);
    await api.post('/api/feynman/check').send({ cardId: 9999, explanation: 'abcdef' }).expect(404);
  });

  it('parseFeedback verträgt Code-Fences', () => {
    expect(parseFeedback('```json\n{"score": 55.4, "correct": [], "missing": "x", "question": 3}\n```')).toEqual({
      score: 55,
      correct: [],
      missing: [],
      question: '',
    });
  });
});
