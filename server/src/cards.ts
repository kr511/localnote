import type { DB } from './db.js';
import { parseCards } from './parser.js';
import { emptyFsrsFields } from './srs.js';

/**
 * Re-derives all cards of a page from its blocks.
 * Cards are keyed by (block_id, slot): editing text keeps FSRS state,
 * slots that disappear are deleted, new slots start as New cards.
 */
export function syncPageCards(db: DB, pageId: number): void {
  const blocks = db
    .prepare('SELECT id, content FROM blocks WHERE page_id = ?')
    .all(pageId) as { id: string; content: string }[];
  const existing = db
    .prepare('SELECT id, block_id, slot, kind FROM cards WHERE page_id = ?')
    .all(pageId) as { id: number; block_id: string; slot: string; kind: string }[];

  const byKey = new Map(existing.map((c) => [`${c.block_id}|${c.slot}`, c]));
  const keep = new Set<number>();

  const update = db.prepare('UPDATE cards SET front = ?, back = ?, kind = ? WHERE id = ?');
  const insert = db.prepare(`
    INSERT INTO cards (block_id, page_id, slot, kind, front, back, due, stability, difficulty,
      elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
    VALUES (@block_id, @page_id, @slot, @kind, @front, @back, @due, @stability, @difficulty,
      @elapsed_days, @scheduled_days, @learning_steps, @reps, @lapses, @state, @last_review)
  `);
  const del = db.prepare('DELETE FROM cards WHERE id = ?');

  for (const block of blocks) {
    for (const parsed of parseCards(block.content)) {
      const hit = byKey.get(`${block.id}|${parsed.slot}`);
      if (hit) {
        update.run(parsed.front, parsed.back, parsed.kind, hit.id);
        keep.add(hit.id);
      } else {
        insert.run({ block_id: block.id, page_id: pageId, ...parsed, ...emptyFsrsFields() });
      }
    }
  }
  for (const c of existing) if (!keep.has(c.id)) del.run(c.id);
}
