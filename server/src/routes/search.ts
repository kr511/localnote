import { Router } from 'express';
import type { DB } from '../db.js';
import { h } from '../http.js';

function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

export function searchRouter(db: DB): Router {
  const r = Router();

  r.get(
    '/search',
    h((req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        // Empty query: show recently edited pages.
        const recent = db
          .prepare(
            `SELECT p.id AS pageId, p.title, s.name AS subjectName FROM pages p
             JOIN subjects s ON s.id = p.subject_id ORDER BY p.updated_at DESC LIMIT 8`,
          )
          .all();
        res.json({ pages: recent, blocks: [] });
        return;
      }
      const like = `%${likeEscape(q.toLocaleLowerCase('de'))}%`;
      const pages = db
        .prepare(
          `SELECT p.id AS pageId, p.title, s.name AS subjectName FROM pages p
           JOIN subjects s ON s.id = p.subject_id
           WHERE ulower(p.title) LIKE ? ESCAPE '\\' OR ulower(s.name) LIKE ? ESCAPE '\\'
           ORDER BY p.updated_at DESC LIMIT 10`,
        )
        .all(like, like);
      const blocks = db
        .prepare(
          `SELECT b.id AS blockId, b.content, p.id AS pageId, p.title, s.name AS subjectName FROM blocks b
           JOIN pages p ON p.id = b.page_id JOIN subjects s ON s.id = p.subject_id
           WHERE ulower(b.content) LIKE ? ESCAPE '\\' ORDER BY p.updated_at DESC LIMIT 20`,
        )
        .all(like);
      res.json({ pages, blocks });
    }),
  );

  return r;
}
