import { describe, expect, it } from 'vitest';
import { block, setup } from './helpers.js';

async function seed() {
  const ctx = setup();
  const subject = (await ctx.api.post('/api/subjects').send({ name: 'Bio' }).expect(201)).body;
  const page = (await ctx.api.post('/api/pages').send({ subjectId: subject.id, title: 'Herz' }).expect(201)).body;
  return { ...ctx, subject, page };
}

describe('Fächer und Seiten', () => {
  it('legt an, benennt um, löscht', async () => {
    const { api, subject, page } = await seed();
    await api.patch(`/api/subjects/${subject.id}`).send({ name: 'Biologie' }).expect(200);
    await api.patch(`/api/pages/${page.id}`).send({ title: 'Das Herz' }).expect(200);

    const tree = (await api.get('/api/tree').expect(200)).body;
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ name: 'Biologie', pages: [{ title: 'Das Herz', cardCount: 0 }] });

    await api.delete(`/api/pages/${page.id}`).expect(204);
    await api.delete(`/api/subjects/${subject.id}`).expect(204);
    expect((await api.get('/api/tree')).body).toEqual([]);
  });

  it('validiert Eingaben', async () => {
    const { api } = setup();
    await api.post('/api/subjects').send({ name: '   ' }).expect(400);
    await api.post('/api/pages').send({ subjectId: 999, title: 'x' }).expect(404);
    await api.get('/api/pages/abc').expect(400);
    await api.delete('/api/subjects/42').expect(404);
    await api.get('/api/gibtsnicht').expect(404);
  });
});

describe('Blöcke und Karten', () => {
  it('speichert Blöcke und erzeugt Karten', async () => {
    const { api, page } = await seed();
    const blocks = [
      block('Herz'),
      block('Was pumpt das Herz? >> Blut', 1),
      block('Systole << Kontraktionsphase', 1),
      block('Das Herz hat {{vier}} Kammern', 1),
      block('Nur eine Notiz', 2),
    ];
    const res = await api.put(`/api/pages/${page.id}/blocks`).send({ blocks }).expect(200);
    expect(res.body.cards[blocks[1].id]).toEqual({ kind: 'basic', count: 1 });
    expect(res.body.cards[blocks[2].id]).toEqual({ kind: 'reverse', count: 2 });
    expect(res.body.cards[blocks[3].id]).toEqual({ kind: 'cloze', count: 1 });
    expect(res.body.cards[blocks[4].id]).toBeUndefined();

    const loaded = (await api.get(`/api/pages/${page.id}`).expect(200)).body;
    expect(loaded.blocks.map((b: { content: string; indent: number }) => [b.indent, b.content])).toEqual(
      blocks.map((b) => [b.indent, b.content]),
    );
  });

  it('behält den Lernstand beim Bearbeiten und löscht verwaiste Karten', async () => {
    const { api, db, page } = await seed();
    const b = block('Frage >> Antwort');
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [b] }).expect(200);
    const card = db.prepare('SELECT * FROM cards').get() as { id: number };
    await api.post(`/api/study/${card.id}/review`).send({ rating: 3 }).expect(200);

    // Text korrigieren: gleiche Karte, Reps bleiben
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [{ ...b, content: 'Frage? >> Antwort!' }] });
    const after = db.prepare('SELECT * FROM cards').get() as { id: number; reps: number; front: string };
    expect(after).toMatchObject({ id: card.id, reps: 1, front: 'Frage?' });

    // Block wird zur Notiz: Karte weg
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [{ ...b, content: 'keine Karte' }] });
    expect(db.prepare('SELECT COUNT(*) AS n FROM cards').get()).toEqual({ n: 0 });

    // Block gelöscht
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [] });
    expect(db.prepare('SELECT COUNT(*) AS n FROM blocks').get()).toEqual({ n: 0 });
  });

  it('lehnt kaputte Blöcke ab', async () => {
    const { api, page } = await seed();
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: 'nope' }).expect(400);
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [{ id: 'x', indent: 0, content: '' }] }).expect(400);
    const b = block('a');
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [b, b] }).expect(400);
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [{ ...b, indent: -1 }] }).expect(400);
  });

  it('lässt keine Blöcke anderer Seiten kapern', async () => {
    const { api, page, subject } = await seed();
    const other = (await api.post('/api/pages').send({ subjectId: subject.id, title: 'B' })).body;
    const b = block('x >> y');
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [b] }).expect(200);
    await api.put(`/api/pages/${other.id}/blocks`).send({ blocks: [b] }).expect(409);
  });
});

describe('Lernmodus', () => {
  it('liefert fällige Karten und plant nach Bewertung neu', async () => {
    const { api, page, subject } = await seed();
    await api
      .put(`/api/pages/${page.id}/blocks`)
      .send({ blocks: [block('A >> 1'), block('B >> 2')] })
      .expect(200);

    const due = (await api.get('/api/study/due').expect(200)).body;
    expect(due.cards).toHaveLength(2);
    expect(due.cards[0]).toMatchObject({ subjectName: 'Bio', pageTitle: 'Herz', state: 0 });
    expect(Object.keys(due.cards[0].intervals)).toEqual(['1', '2', '3', '4']);
    expect(due.counts).toEqual([{ subjectId: subject.id, name: 'Bio', due: 2 }]);

    // "Einfach" -> Tage in der Zukunft, nicht mehr fällig
    const r = (await api.post(`/api/study/${due.cards[0].id}/review`).send({ rating: 4 }).expect(200)).body;
    expect(new Date(r.due).getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    expect(r.card).toMatchObject({ id: due.cards[0].id, reps: 1 });
    expect((await api.get('/api/study/due')).body.cards).toHaveLength(1);

    // Filter nach Fach
    expect((await api.get(`/api/study/due?subjectId=${subject.id + 1}`)).body.cards).toHaveLength(0);
  });

  it('validiert die Bewertung', async () => {
    const { api } = setup();
    await api.post('/api/study/1/review').send({ rating: 3 }).expect(404);
    await api.post('/api/study/1/review').send({ rating: 7 }).expect(400);
    await api.post('/api/study/1/review').send({}).expect(400);
  });
});

describe('Suche', () => {
  it('findet Seiten und Blöcke', async () => {
    const { api, page } = await seed();
    await api.put(`/api/pages/${page.id}/blocks`).send({ blocks: [block('Die Aorta ist groß'), block('Übung macht den Meister')] });
    const res = (await api.get('/api/search?q=aorta').expect(200)).body;
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks[0]).toMatchObject({ pageId: page.id, title: 'Herz' });
    expect((await api.get('/api/search?q=herz')).body.pages).toHaveLength(1);
    expect((await api.get('/api/search?q=100%25')).body.blocks).toHaveLength(0);
    expect((await api.get('/api/search?q=' + encodeURIComponent('übung'))).body.blocks).toHaveLength(1);
    expect((await api.get('/api/search')).body.pages).toHaveLength(1);
  });
});
