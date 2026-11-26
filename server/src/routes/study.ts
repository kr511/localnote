import { Router } from 'express';
import type { DB } from '../db.js';
import { h, HttpError, intParam, notFound } from '../http.js';
import { isGrade, previewIntervals, review, type CardRow } from '../srs.js';

const CARD_SELECT = `
  SELECT c.*, p.title AS pageTitle, s.id AS subjectId, s.name AS subjectName
  FROM cards c
  JOIN pages p ON p.id = c.page_id
  JOIN subjects s ON s.id = p.subject_id
`;

export type StudyCardRow = CardRow & { pageTitle: string; subjectId: number; subjectName: string };

export function toStudyCard(row: StudyCardRow, now = new Date()) {
  return {
    id: row.id,
    kind: row.kind,
    front: row.front,
    back: row.back,
    state: row.state,
    due: row.due,
    reps: row.reps,
    pageId: row.page_id,
    pageTitle: row.pageTitle,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    intervals: previewIntervals(row, now),
  };
}

export function studyRouter(db: DB): Router {
  const r = Router();

  r.get(
    '/study/due',
    h((req, res) => {
      const now = new Date();
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : null;
      if (subjectId !== null && !Number.isInteger(subjectId)) throw new HttpError(400, 'Ungültige subjectId');

      const rows = db
        .prepare(
          `${CARD_SELECT} WHERE c.due <= ? ${subjectId ? 'AND s.id = ?' : ''}
           ORDER BY c.state = 0, c.due LIMIT 500`,
        )
        .all(...(subjectId ? [now.toISOString(), subjectId] : [now.toISOString()])) as StudyCardRow[];

      const counts = db
        .prepare(
          `SELECT s.id AS subjectId, s.name, COUNT(c.id) AS due
           FROM subjects s
           LEFT JOIN pages p ON p.subject_id = s.id
           LEFT JOIN cards c ON c.page_id = p.id AND c.due <= ?
           GROUP BY s.id ORDER BY s.position, s.id`,
        )
        .all(now.toISOString());

      res.json({ cards: rows.map((r) => toStudyCard(r, now)), counts });
    }),
  );

  r.post(
    '/study/:cardId/review',
    h((req, res) => {
      const cardId = intParam(req, 'cardId');
      const rating = req.body?.rating;
      if (!isGrade(rating)) throw new HttpError(400, 'rating muss 1 bis 4 sein');
      const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as CardRow | undefined;
      if (!row) throw notFound('Karte');

      const now = new Date();
      const { fields, log } = review(row, rating, now);
      db.transaction(() => {
        db.prepare(
          `UPDATE cards SET due=@due, stability=@stability, difficulty=@difficulty, elapsed_days=@elapsed_days,
             scheduled_days=@scheduled_days, learning_steps=@learning_steps, reps=@reps, lapses=@lapses,
             state=@state, last_review=@last_review WHERE id=@id`,
        ).run({ ...fields, id: cardId });
        db.prepare(
          `INSERT INTO review_logs (card_id, rating, state, due, stability, difficulty, scheduled_days, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(cardId, rating, log.state, fields.due, fields.stability, fields.difficulty, fields.scheduled_days, now.toISOString());
      })();

      const updated = db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(cardId) as StudyCardRow;
      res.json({ id: cardId, due: fields.due, state: fields.state, card: toStudyCard(updated, now) });
    }),
  );

  return r;
}
