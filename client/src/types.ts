export interface PageSummary {
  id: number;
  subjectId: number;
  title: string;
  cardCount: number;
}

export interface Subject {
  id: number;
  name: string;
  pages: PageSummary[];
}

export interface Block {
  id: string;
  indent: number;
  content: string;
}

export interface PageDetail {
  id: number;
  subjectId: number;
  subjectName: string;
  title: string;
  blocks: Block[];
}

export interface StudyCard {
  id: number;
  kind: 'basic' | 'reverse' | 'cloze';
  front: string;
  back: string;
  state: number;
  due: string;
  reps: number;
  pageId: number;
  pageTitle: string;
  subjectId: number;
  subjectName: string;
  intervals: Record<string, string>;
}

export interface DueCount {
  subjectId: number;
  name: string;
  due: number;
}

export interface SearchResult {
  pages: { pageId: number; title: string; subjectName: string }[];
  blocks: { blockId: string; content: string; pageId: number; title: string; subjectName: string }[];
}

export interface ExamSummary {
  id: number;
  subjectId: number;
  subjectName: string;
  title: string;
  examDate: string;
  pageIds: number[];
  daysLeft: number;
  hoursLeft: number;
  isPast: boolean;
  cramForced: boolean;
  cramActive: boolean;
  progress: { total: number; new: number; shaky: number; mastered: number };
  dailyGoal: { total: number; dueToday: number; newPerDay: number; doneToday: number; planDays: number };
}

export interface ExamInput {
  subjectId: number;
  title: string;
  examDate: string;
  pageIds: number[];
}

export interface CramExam {
  id: number;
  title: string;
  subjectId: number;
  subjectName: string;
  examDate: string;
}

export interface FeynmanFeedback {
  score: number;
  correct: string[];
  missing: string[];
  question: string;
  model: string;
}

export interface OllamaStatus {
  available: boolean;
  url: string;
  model: string;
  modelInstalled: boolean;
  models: string[];
  message?: string;
}

export interface Settings {
  ollamaUrl: string;
  ollamaModel: string;
  ollamaUrlSource: 'db' | 'env' | 'default';
  ollamaModelSource: 'db' | 'env' | 'default';
}

export type View =
  | { type: 'home' }
  | { type: 'page'; id: number; focusBlockId?: string }
  | { type: 'study'; subjectId?: number; examId?: number; cram?: boolean }
  | { type: 'exams' }
  | { type: 'settings' };
