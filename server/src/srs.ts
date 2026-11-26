import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';

export const scheduler = fsrs({ enable_fuzz: true });

export interface CardRow {
  id: number;
  block_id: string;
  page_id: number;
  slot: string;
  kind: string;
  front: string;
  back: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

export type FsrsFields = Pick<
  CardRow,
  | 'due'
  | 'stability'
  | 'difficulty'
  | 'elapsed_days'
  | 'scheduled_days'
  | 'learning_steps'
  | 'reps'
  | 'lapses'
  | 'state'
  | 'last_review'
>;

export function emptyFsrsFields(now = new Date()): FsrsFields {
  return toRow(createEmptyCard(now));
}

export function toCard(row: FsrsFields): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

export function toRow(card: Card): FsrsFields {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export function isGrade(n: unknown): n is Grade {
  return typeof n === 'number' && GRADES.includes(n as Grade);
}

/** Human readable interval like "10 Min", "3 T", "2 Mon". */
export function formatInterval(from: Date, to: Date): string {
  const mins = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  if (mins < 60) return `${mins} Min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} Std`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} T`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} Mon`;
  return `${(days / 365).toFixed(1).replace('.', ',')} J`;
}

/** Interval preview per rating, e.g. {1: "1 Min", 2: "6 Min", 3: "10 Min", 4: "8 T"}. */
export function previewIntervals(row: FsrsFields, now = new Date()): Record<number, string> {
  const card = toCard(row);
  const out: Record<number, string> = {};
  for (const g of GRADES) out[g] = formatInterval(now, scheduler.next(card, now, g).card.due);
  return out;
}

export function review(row: FsrsFields, grade: Grade, now = new Date()) {
  const { card, log } = scheduler.next(toCard(row), now, grade);
  return { fields: toRow(card), log };
}

export function retrievability(row: FsrsFields, at: Date): number {
  if (row.state === State.New) return 0;
  return scheduler.get_retrievability(toCard(row), at, false);
}
