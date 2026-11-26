import { Router } from 'express';
import type { DB } from '../db.js';
import { syncPageCards } from '../cards.js';
import { h, HttpError, intParam, notFound, requireString } from '../http.js';

interface BlockInput {
  id: string;
  indent: number;
  content: string;
}

const UUIDish = /^[A-Za-z0-9-]{8,64}$/;

function validateBlocks(raw: unknown): BlockInput[] {
  if (!Array.isArray(raw)) throw new HttpError(400, 'blocks muss eine Liste sein');
  if (raw.length > 5000) throw new HttpError(400, 'Zu viele Blöcke');
  const seen = new Set<string>();
  return raw.map((b, i) => {
    if (!b || typeof b !== 'object') throw new HttpError(400, `Block ${i} ungültig`);
    const { id, indent, content } = b as Record<string, unknown>;
    if (typeof id !== 'string' || !UUIDish.test(id)) throw new HttpError(400, `Block ${i}: ungültige id`);
    if (seen.has(id)) throw new HttpError(400, `Block ${i}: doppelte id`);
    seen.add(id);
    if (!Number.isInteger(indent) || (indent as number) < 0 || (indent as number) > 20)
      throw new HttpError(400, `Block ${i}: ungültige Einrückung`);
    if (typeof content !== 'string' || content.length > 20000)
      throw new HttpError(400, `Block ${i}: ungültiger Inhalt`);
    return { id, indent: indent as number, content };
  });
}

export function cardsByBlock(db: DB, pageId: number) {
  const rows = db
    .prepare('SELECT block_id, kind, COUNT(*) AS n FROM cards WHERE page_id = ? GROUP BY block_id, kind')
    .all(pageId) as { block_id: string; kind: string; n: number }[];
  const out: Record<string, { kind: string; count: number }> = {};
  for (const r of rows) out[r.block_id] = { kind: r.kind, count: r.n };
  return out;
}

export function pagesRouter(db: DB): Router {
  const r = Router();

  const getPage = (id: number) =>
    db
      .prepare(
        `SELECT p.id, p.subject_id AS subjectId, p.title, p.updated_at AS updatedAt, s.name AS subjectName
         FROM pages p JOIN subjects s ON s.id = p.subject_id WHERE p.id = ?`,
      )
      .get(id) as { id: number; subjectId: number; title: string } | undefined;

  r.post(
    '/pages',
    h((req, res) => {
      const subjectId = Number(req.body?.subjectId);
      const title = requireString(req.body?.title, 'Titel', 200);
      if (!db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(subjectId)) throw notFound('Fach');
      const pos = db
        .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM pages WHERE subject_id = ?')
        .get(subjectId) as { p: number };
      const info = db
        .prepare('INSERT INTO pages (subject_id, title, position) VALUES (?, ?, ?)')
        .run(subjectId, title, pos.p);
      res.status(201).json({ id: Number(info.lastInsertRowid), subjectId, title, position: pos.p, cardCount: 0 });
    }),
  );

  r.get(
    '/pages/:id',
    h((req, res) => {
      const id = intParam(req, 'id');
      const page = getPage(id);
      if (!page) throw notFound('Seite');
      const blocks = db
        .prepare('SELECT id, indent, content FROM blocks WHERE page_id = ? ORDER BY position')
        .all(id);
      res.json({ ...page, blocks, cards: cardsByBlock(db, id) });
    }),
  );

  r.patch(
    '/pages/:id',
    h((req, res) => {
      const id = intParam(req, 'id');
      const title = requireString(req.body?.title, 'Titel', 200);
      const info = db
        .prepare("UPDATE pages SET title = ?, updated_at = datetime('now') WHERE id = ?")
        .run(title, id);
      if (!info.changes) throw notFound('Seite');
      res.json({ id, title });
    }),
  );

  r.delete(
    '/pages/:id',
    h((req, res) => {
      const id = intParam(req, 'id');
      const info = db.prepare('DELETE FROM pages WHERE id = ?').run(id);
      if (!info.changes) throw notFound('Seite');
      res.status(204).end();
    }),
  );

  r.put(
    '/pages/:id/blocks',
    h((req, res) => {
      const id = intParam(req, 'id');
      if (!getPage(id)) throw notFound('Seite');
      const blocks = validateBlocks(req.body?.blocks);

      // Block ids are global; refuse to "steal" a block from another page.
      const foreign = db.prepare('SELECT page_id FROM blocks WHERE id = ?');
      for (const b of blocks) {
        const row = foreign.get(b.id) as { page_id: number } | undefined;
        if (row && row.page_id !== id) throw new HttpError(409, 'Block gehört zu einer anderen Seite');
      }

      db.transaction(() => {
        // Upsert instead of delete+insert so cards (ON DELETE CASCADE) survive.
        const ids = blocks.map((b) => b.id);
        const existing = db.prepare('SELECT id FROM blocks WHERE page_id = ?').all(id) as { id: string }[];
        const keep = new Set(ids);
        const del = db.prepare('DELETE FROM blocks WHERE id = ?');
        for (const e of existing) if (!keep.has(e.id)) del.run(e.id);

        const upsert = db.prepare(`
          INSERT INTO blocks (id, page_id, position, indent, content) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET position = excluded.position, indent = excluded.indent, content = excluded.content
        `);
        blocks.forEach((b, i) => upsert.run(b.id, id, i, b.indent, b.content));
        db.prepare("UPDATE pages SET updated_at = datetime('now') WHERE id = ?").run(id);
        syncPageCards(db, id);
      })();

      res.json({ cards: cardsByBlock(db, id) });
    }),
  );

  return r;
}
