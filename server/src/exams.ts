import type { DB } from './db.js';
import { retrievability, type CardRow } from './srs.js';

/** Exams are treated as starting at 08:00 local time on their date. */
export const EXAM_HOUR = 8;
export const CRAM_WINDOW_HOURS = 48;
/** Retrievability on exam day at/above which a card counts as "sitzt". */
export const MASTERED_R = 0.85;

export interface ExamRow {
  id: number;
  subject_id: number;
  title: string;
  exam_date: string;
  cram_forced: number;
  subjectName: string;
}

export function examStart(examDate: string): Date {
  const [y, m, d] = examDate.split('-').map(Number);
  return new Date(y, m - 1, d, EXAM_HOUR, 0, 0, 0);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

/** Calendar days from today to the exam date (0 = today, negative = past). */
export function daysUntil(examDate: string, now: Date): number {
  const [y, m, d] = examDate.split('-').map(Number);
  const exam = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam - today) / 86_400_000);
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function getExam(db: DB, id: number): ExamRow | undefined {
  return db
    .prepare(
      `SELECT e.*, s.name AS subjectName FROM exams e JOIN subjects s ON s.id = e.subject_id WHERE e.id = ?`,
    )
    .get(id) as ExamRow | undefined;
}

export function examPageIds(db: DB, examId: number): number[] {
  return (db.prepare('SELECT page_id FROM exam_pages WHERE exam_id = ? ORDER BY page_id').all(examId) as {
    page_id: number;
  }[]).map((r) => r.page_id);
}

/** SQL fragment + params selecting the card ids that belong to an exam. */
export function scopeWhere(db: DB, exam: ExamRow): { sql: string; params: number[] } {
  const pages = examPageIds(db, exam.id);
  if (pages.length) return { sql: `c.page_id IN (${pages.map(() => '?').join(',')})`, params: pages };
  return { sql: 'c.page_id IN (SELECT id FROM pages WHERE subject_id = ?)', params: [exam.subject_id] };
}

export type ScopedCard = CardRow & { lastRating: number | null };

export function scopeCards(db: DB, exam: ExamRow): ScopedCard[] {
  const { sql, params } = scopeWhere(db, exam);
  return db
    .prepare(
      `SELECT c.*,
         (SELECT rating FROM review_logs l WHERE l.card_id = c.id ORDER BY l.reviewed_at DESC, l.id DESC LIMIT 1) AS lastRating
       FROM cards c WHERE ${sql}`,
    )
    .all(...params) as ScopedCard[];
}

export type Bucket = 'new' | 'shaky' | 'mastered';

export function bucketOf(card: CardRow, examAt: Date): Bucket {
  if (card.state === 0) return 'new';
  if (card.state === 2 && retrievability(card, examAt) >= MASTERED_R) return 'mastered';
  return 'shaky';
}

export function isCramActive(exam: ExamRow, now: Date): boolean {
  const hoursLeft = (examStart(exam.exam_date).getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft <= -12) return false; // exam is over
  return exam.cram_forced === 1 || hoursLeft <= CRAM_WINDOW_HOURS;
}

export function examSummary(db: DB, exam: ExamRow, now = new Date()) {
  const examAt = examStart(exam.exam_date);
  const cards = scopeCards(db, exam);
  const progress = { total: cards.length, new: 0, shaky: 0, mastered: 0 };
  for (const c of cards) progress[bucketOf(c, examAt)]++;

  const daysLeft = daysUntil(exam.exam_date, now);
  const hoursLeft = (examAt.getTime() - now.getTime()) / 3_600_000;
  const eod = endOfDay(now).toISOString();
  const dueToday = cards.filter((c) => c.state !== 0 && c.due < eod).length;
  const planDays = Math.max(1, daysLeft - 1);
  const newPerDay = daysLeft < 0 ? 0 : Math.ceil(progress.new / planDays);

  const { sql, params } = scopeWhere(db, exam);
  const doneToday = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT l.card_id) AS n FROM review_logs l JOIN cards c ON c.id = l.card_id
         WHERE l.reviewed_at >= ? AND ${sql}`,
      )
      .get(startOfDay(now).toISOString(), ...params) as { n: number }
  ).n;

  return {
    id: exam.id,
    subjectId: exam.subject_id,
    subjectName: exam.subjectName,
    title: exam.title,
    examDate: exam.exam_date,
    pageIds: examPageIds(db, exam.id),
    daysLeft,
    hoursLeft: Math.round(hoursLeft * 10) / 10,
    isPast: hoursLeft <= -12,
    cramForced: exam.cram_forced === 1,
    cramActive: isCramActive(exam, now),
    progress,
    dailyGoal: { total: dueToday + newPerDay, dueToday, newPerDay, doneToday, planDays },
  };
}

const PRIORITY = (c: ScopedCard, examAt: Date): number => {
  if (c.lastRating === 1) return 0;
  if (c.lastRating === 2) return 1;
  if (c.state === 1 || c.state === 3 || bucketOf(c, examAt) === 'shaky') return 2;
  if (c.state === 0) return 3;
  return 4;
};

/** Cards ordered for cram: weakest first. Never mutates FSRS state. */
export function cramQueue(db: DB, exam: ExamRow, now = new Date()) {
  const examAt = examStart(exam.exam_date);
  return scopeCards(db, exam)
    .map((c) => ({ card: c, prio: PRIORITY(c, examAt), r: retrievability(c, now) }))
    .sort((a, b) => a.prio - b.prio || a.r - b.r || a.card.id - b.card.id)
    .map((x) => ({ ...x.card, cramPriority: x.prio }));
}
