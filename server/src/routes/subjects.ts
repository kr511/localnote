import { Router } from 'express';
import type { DB } from '../db.js';
import { h, intParam, notFound, requireString } from '../http.js';

export function subjectsRouter(db: DB): Router {
  const r = Router();

  r.get(
    '/tree',
    h((_req, res) => {
      const subjects = db
        .prepare('SELECT id, name, position FROM subjects ORDER BY position, id')
        .all() as { id: number; name: string; position: number }[];
      const pages = db
        .prepare(
          `SELECT p.id, p.subject_id AS subjectId, p.title, p.position,
             (SELECT COUNT(*) FROM cards c WHERE c.page_id = p.id) AS cardCount
           FROM pages p ORDER BY p.position, p.id`,
        )
        .all() as { id: number; subjectId: number; title: string }[];
      res.json(
        subjects.map((s) => ({ ...s, pages: pages.filter((p) => p.subjectId === s.id) })),
      );
    }),
  );

  r.post(
    '/subjects',
    h((req, res) => {
      const name = requireString(req.body?.name, 'Name', 120);
      const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM subjects').get() as {
        p: number;
      };
      const info = db.prepare('INSERT INTO subjects (name, position) VALUES (?, ?)').run(name, pos.p);
      res.status(201).json({ id: Number(info.lastInsertRowid), name, position: pos.p, pages: [] });
    }),
  );

  r.patch(
    '/subjects/:id',
    h((req, res) => {
      const id = intParam(req, 'id');
      const name = requireString(req.body?.name, 'Name', 120);
      const info = db.prepare('UPDATE subjects SET name = ? WHERE id = ?').run(name, id);
      if (!info.changes) throw notFound('Fach');
      res.json({ id, name });
    }),
  );

  r.delete(
    '/subjects/:id',
    h((req, res) => {
      const id = intParam(req, 'id');
      const info = db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
      if (!info.changes) throw notFound('Fach');
      res.status(204).end();
    }),
  );

  return r;
}
