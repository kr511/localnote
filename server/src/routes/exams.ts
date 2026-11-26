import { Router } from 'express';
import type { DB } from '../db.js';
import { h, HttpError, intParam, notFound, requireString } from '../http.js';
import { cramQueue, examSummary, getExam, isValidDate, scopeWhere, type ExamRow } from '../exams.js';
import { CARD_SELECT, toStudyCard, type StudyCardRow } from './study.js';

function validatePageIds(db: DB, raw: unknown): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((x) => !Number.isInteger(x)))
    throw new HttpError(400, 'pageIds muss eine Liste von IDs sein');
  const ids = [...new Set(raw as number[])];
  const check = db.prepare('SELECT 1 FROM pages WHERE id = ?');
  for (const id of ids) if (!check.get(id)) throw new HttpError(400, `Seite ${id} gibt es nicht`);
  return ids;
}

function setPages(db: DB, examId: number, ids: number[]) {
  db.prepare('DELETE FROM exam_pages WHERE exam_id = ?').run(examId);
  const ins = db.prepare('INSERT INTO exam_pages (exam_id, page_id) VALUES (?, ?)');
  for (const id of ids) ins.run(examId, id);
}

export function examsRouter(db: DB): Router {
  const r = Router();

  const load = (id: number): ExamRow => {
    const exam = getExam(db, id);
    if (!exam) throw notFound('Klausur');
    return exam;
  };

  r.get(
    '/exams',
    h((_req, res) => {
      const now = new Date();
      const rows = db
        .prepare(
          `SELECT e.*, s.name AS subjectName FROM exams e JOIN subjects s ON s.id = e.subject_id
           ORDER BY e.exam_date, e.id`,
        )
        .all() as ExamRow[];
      res.json(rows.map((e) => examSummary(db, e, now)));
    }),
  );

  r.post(
    '/exams',
    h((req, res) => {
      const subjectId = Number(req.body?.subjectId);
      const title = requireString(req.body?.title, 'Titel', 200);
      const examDate = req.body?.examDate;
      if (!isValidDate(examDate)) throw new HttpError(400, 'examDate muss YYYY-MM-DD sein');
      if (!db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(subjectId)) throw notFound('Fach');
      const pageIds = validatePageIds(db, req.body?.pageIds);
      const id = db.transaction(() => {
        const info = db
          .prepare('INSERT INTO exams (subject_id, title, exam_date) VALUES (?, ?, ?)')
          .run(subjectId, title, examDate);
        const id = Number(info.lastInsertRowid);
        setPages(db, id, pageIds);
        return id;
      })();
      res.status(201).json(examSummary(db, load(id)));
    }),
  );

  r.patch(
    '/exams/:id',
    h((req, res) => {
      const id = intParam(req, 'id');
      const exam = load(id);
      const b = req.body ?? {};
      const title = b.title !== undefined ? requireString(b.title, 'Titel', 200) : exam.title;
      if (b.examDate !== undefined && !isValidDate(b.examDate)) throw new HttpError(400, 'examDate muss YYYY-MM-DD sein');
      const examDate = b.examDate ?? exam.exam_date;
      const subjectId = b.subjectId !== undefined ? Number(b.subjectId) : exam.subject_id;
      if (!db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(subjectId)) throw notFound('Fach');
      if (b.cramForced !== undefined && typeof b.cramForced !== 'boolean')
        throw new HttpError(400, 'cramForced muss true/false sein');
      const cram = b.cramForced !== undefined ? Number(b.cramForced) : exam.cram_forced;
      const pageIds = b.pageIds !== undefined ? validatePageIds(db, b.pageIds) : null;

      db.transaction(() => {
        db.prepare('UPDATE exams SET title = ?, exam_date = ?, subject_id = ?, cram_forced = ? WHERE id = ?').run(
          title,
          examDate,
          subjectId,
          cram,
          id,
        );
        if (pageIds) setPages(db, id, pageIds);
      })();
      res.json(examSummary(db, load(id)));
    }),
  );

  r.delete(
    '/exams/:id',
    h((req, res) => {
      const id = intParam(req, 'id');
      const info = db.prepare('DELETE FROM exams WHERE id = ?').run(id);
      if (!info.changes) throw notFound('Klausur');
      res.status(204).end();
    }),
  );

  // Regular FSRS-due cards, restricted to the exam's material.
  r.get(
    '/exams/:id/due',
    h((req, res) => {
      const exam = load(intParam(req, 'id'));
      const now = new Date();
      const { sql, params } = scopeWhere(db, exam);
      const rows = db
        .prepare(`${CARD_SELECT} WHERE c.due <= ? AND ${sql} ORDER BY c.state = 0, c.due LIMIT 500`)
        .all(now.toISOString(), ...params) as StudyCardRow[];
      res.json({ exam: examSummary(db, exam, now), cards: rows.map((c) => toStudyCard(c, now)) });
    }),
  );

  r.get(
    '/exams/:id/cram',
    h((req, res) => {
      const exam = load(intParam(req, 'id'));
      const now = new Date();
      const summary = examSummary(db, exam, now);
      if (!summary.cramActive)
        throw new HttpError(409, 'Cram-Modus ist erst 48 Stunden vor der Klausur aktiv oder per Button.', 'cram_inactive');
      const queue = cramQueue(db, exam, now);
      const byId = new Map(
        (
          db
            .prepare(`${CARD_SELECT} WHERE c.id IN (${queue.map(() => '?').join(',') || 'NULL'})`)
            .all(...queue.map((q) => q.id)) as StudyCardRow[]
        ).map((r) => [r.id, r]),
      );
      res.json({
        exam: summary,
        cards: queue.map((q) => ({ ...toStudyCard(byId.get(q.id)!, now), cramPriority: q.cramPriority })),
      });
    }),
  );

  return r;
}
