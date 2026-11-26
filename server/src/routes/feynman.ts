import { Router } from 'express';
import type { DB } from '../db.js';
import { h, HttpError, notFound } from '../http.js';
import { getOllamaConfig, ollamaChat, ollamaStatus } from '../ollama.js';
import { blockContext, buildMessages, FEEDBACK_SCHEMA, parseFeedback } from '../feynman.js';
import { CARD_SELECT, type StudyCardRow } from './study.js';

export function feynmanRouter(db: DB): Router {
  const r = Router();

  r.get(
    '/feynman/status',
    h(async (_req, res) => {
      res.json(await ollamaStatus(getOllamaConfig(db)));
    }),
  );

  r.post(
    '/feynman/check',
    h(async (req, res) => {
      const cardId = Number(req.body?.cardId);
      const explanation = typeof req.body?.explanation === 'string' ? req.body.explanation.trim() : '';
      if (!Number.isInteger(cardId)) throw new HttpError(400, 'cardId fehlt');
      if (explanation.length < 3) throw new HttpError(400, 'Schreib erst eine Erklärung.');
      if (explanation.length > 5000) throw new HttpError(400, 'Die Erklärung ist zu lang (max. 5000 Zeichen).');

      const card = db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(cardId) as StudyCardRow | undefined;
      if (!card) throw notFound('Karte');

      const cfg = getOllamaConfig(db);
      const messages = buildMessages(card, blockContext(db, card.block_id), explanation);
      const feedback = parseFeedback(await ollamaChat(cfg, messages, FEEDBACK_SCHEMA));

      db.prepare(
        'INSERT INTO feynman_attempts (card_id, explanation, score, feedback, model) VALUES (?, ?, ?, ?, ?)',
      ).run(
        cardId,
        explanation,
        feedback.score,
        JSON.stringify({ correct: feedback.correct, missing: feedback.missing, question: feedback.question }),
        cfg.model,
      );
      res.json({ ...feedback, model: cfg.model });
    }),
  );

  return r;
}
