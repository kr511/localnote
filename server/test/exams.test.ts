import { afterEach, describe, expect, it, vi } from 'vitest';
import { block, setup } from './helpers.js';
import { daysUntil, examStart, isValidDate } from '../src/exams.js';

const NOW = new Date(2026, 10, 26, 10, 0, 0); // 26.11.2026 10:00 local

function localDate(offsetDays: number) {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seed() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const ctx = setup();
  const bio = (await ctx.api.post('/api/subjects').send({ name: 'Bio' })).body;
  const p1 = (await ctx.api.post('/api/pages').send({ subjectId: bio.id, title: 'Herz' })).body;
  const p2 = (await ctx.api.post('/api/pages').send({ subjectId: bio.id, title: 'Zelle' })).body;
  await ctx.api.put(`/api/pages/${p1.id}/blocks`).send({ blocks: [block('A >> 1'), block('B >> 2'), block('C >> 3')] });
  await ctx.api.put(`/api/pages/${p2.id}/blocks`).send({ blocks: [block('D >> 4')] });
  return { ...ctx, bio, p1, p2 };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Datums-Helfer', () => {
  it('rechnet Tage und prüft Datumsformat', () => {
    expect(daysUntil('2026-12-01', NOW)).toBe(5);
    expect(daysUntil('2026-11-26', NOW)).toBe(0);
    expect(examStart('2026-12-01').getHours()).toBe(8);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-2-3')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
  });
});

describe('Klausuren', () => {
  it('CRUD mit verknüpften Seiten und Validierung', async () => {
    const { api, bio, p1 } = await seed();
    await api.post('/api/exams').send({ subjectId: bio.id, title: 'x', examDate: '30.11.2026' }).expect(400);
    await api.post('/api/exams').send({ subjectId: 999, title: 'x', examDate: localDate(3) }).expect(404);
    await api.post('/api/exams').send({ subjectId: bio.id, title: 'x', examDate: localDate(3), pageIds: [999] }).expect(400);

    const e = (
      await api.post('/api/exams').send({ subjectId: bio.id, title: 'Herz-Test', examDate: localDate(10), pageIds: [p1.id] }).expect(201)
    ).body;
    expect(e).toMatchObject({ title: 'Herz-Test', daysLeft: 10, pageIds: [p1.id], cramActive: false, isPast: false });
    expect(e.progress).toEqual({ total: 3, new: 3, shaky: 0, mastered: 0 });
    // 3 neue Karten auf 9 Planungstage -> 1 pro Tag
    expect(e.dailyGoal).toMatchObject({ newPerDay: 1, dueToday: 0, total: 1, planDays: 9, doneToday: 0 });

    const upd = (await api.patch(`/api/exams/${e.id}`).send({ pageIds: [], title: 'Bio-Klausur' }).expect(200)).body;
    expect(upd).toMatchObject({ title: 'Bio-Klausur', pageIds: [] });
    expect(upd.progress.total).toBe(4); // ganzes Fach

    await api.patch(`/api/exams/${e.id}`).send({ examDate: 'morgen' }).expect(400);
    await api.patch(`/api/exams/${e.id}`).send({ cramForced: 'ja' }).expect(400);
    expect((await api.get('/api/exams').expect(200)).body).toHaveLength(1);
    await api.delete(`/api/exams/${e.id}`).expect(204);
    await api.delete(`/api/exams/${e.id}`).expect(404);
  });

  it('zählt Fortschritt und heute erledigte Karten', async () => {
    const { api, bio, db } = await seed();
    const e = (await api.post('/api/exams').send({ subjectId: bio.id, title: 'K', examDate: localDate(4) })).body;
    const ids = (db.prepare('SELECT id FROM cards ORDER BY id').all() as { id: number }[]).map((r) => r.id);
    await api.post(`/api/study/${ids[0]}/review`).send({ rating: 4 }).expect(200); // -> Review, mehrere Tage stabil
    await api.post(`/api/study/${ids[1]}/review`).send({ rating: 1 }).expect(200); // -> Learning
    const s = (await api.get('/api/exams')).body[0];
    expect(s.progress.new).toBe(2);
    expect(s.progress.shaky + s.progress.mastered).toBe(2);
    expect(s.progress.shaky).toBeGreaterThanOrEqual(1);
    expect(s.dailyGoal.doneToday).toBe(2);
    expect(s.dailyGoal.dueToday).toBeGreaterThanOrEqual(1); // die "Nochmal"-Karte
  });

  it('liefert regulär fällige Karten nur aus dem Klausur-Stoff', async () => {
    const { api, bio, p2 } = await seed();
    const e = (await api.post('/api/exams').send({ subjectId: bio.id, title: 'K', examDate: localDate(4), pageIds: [p2.id] })).body;
    const res = (await api.get(`/api/exams/${e.id}/due`).expect(200)).body;
    expect(res.cards.map((c: { front: string }) => c.front)).toEqual(['D']);
  });
});

describe('Cram-Modus', () => {
  it('ist erst innerhalb von 48 Stunden oder manuell aktiv', async () => {
    const { api, bio } = await seed();
    const far = (await api.post('/api/exams').send({ subjectId: bio.id, title: 'fern', examDate: localDate(5) })).body;
    const near = (await api.post('/api/exams').send({ subjectId: bio.id, title: 'nah', examDate: localDate(2) })).body;
    const past = (await api.post('/api/exams').send({ subjectId: bio.id, title: 'vorbei', examDate: localDate(-3) })).body;
    // 2 Tage -> 28.11. 08:00, jetzt 26.11. 10:00 = 46 h
    expect(near).toMatchObject({ cramActive: true, hoursLeft: 46 });
    expect(far.cramActive).toBe(false);
    expect(past).toMatchObject({ cramActive: false, isPast: true });

    await api.get(`/api/exams/${far.id}/cram`).expect(409);
    await api.patch(`/api/exams/${far.id}`).send({ cramForced: true }).expect(200);
    expect((await api.get(`/api/exams/${far.id}/cram`).expect(200)).body.cards).toHaveLength(4);

    const due = (await api.get('/api/study/due')).body;
    expect(due.cramExams.map((e: { title: string }) => e.title).sort()).toEqual(['fern', 'nah']);
  });

  it('priorisiert schwache Karten und lässt FSRS unangetastet', async () => {
    const { api, bio, db } = await seed();
    const e = (await api.post('/api/exams').send({ subjectId: bio.id, title: 'K', examDate: localDate(1) })).body;
    const ids = (db.prepare('SELECT id FROM cards ORDER BY id').all() as { id: number }[]).map((r) => r.id);
    await api.post(`/api/study/${ids[0]}/review`).send({ rating: 4 });
    await api.post(`/api/study/${ids[1]}/review`).send({ rating: 2 });
    await api.post(`/api/study/${ids[2]}/review`).send({ rating: 1 });

    const order = (await api.get(`/api/exams/${e.id}/cram`).expect(200)).body.cards.map((c: { id: number }) => c.id);
    expect(order.slice(0, 2)).toEqual([ids[2], ids[1]]); // Nochmal vor Schwer
    expect(order[order.length - 1]).toBe(ids[0]); // sitzt -> hinten... oder neu davor
    expect(order).toContain(ids[3]);

    const before = db.prepare('SELECT * FROM cards WHERE id = ?').get(ids[2]);
    const r = (await api.post(`/api/study/${ids[2]}/review`).send({ rating: 3, cram: true, examId: e.id }).expect(200)).body;
    expect(r.cram).toBe(true);
    expect(db.prepare('SELECT * FROM cards WHERE id = ?').get(ids[2])).toEqual(before);
    const log = db.prepare('SELECT is_cram, exam_id, rating FROM review_logs ORDER BY id DESC LIMIT 1').get();
    expect(log).toEqual({ is_cram: 1, exam_id: e.id, rating: 3 });

    // nach "Gut" im Cram rutscht die Karte nach hinten
    const order2 = (await api.get(`/api/exams/${e.id}/cram`)).body.cards.map((c: { id: number }) => c.id);
    expect(order2[0]).toBe(ids[1]);
  });

  it('lehnt Cram-Bewertungen ohne aktive Klausur ab', async () => {
    const { api, bio, db } = await seed();
    const far = (await api.post('/api/exams').send({ subjectId: bio.id, title: 'fern', examDate: localDate(9) })).body;
    const id = (db.prepare('SELECT id FROM cards LIMIT 1').get() as { id: number }).id;
    await api.post(`/api/study/${id}/review`).send({ rating: 3, cram: true }).expect(400);
    await api.post(`/api/study/${id}/review`).send({ rating: 3, cram: true, examId: far.id }).expect(409);
  });
});
