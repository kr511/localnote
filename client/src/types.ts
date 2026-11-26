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

export type View =
  | { type: 'home' }
  | { type: 'page'; id: number; focusBlockId?: string }
  | { type: 'study'; subjectId?: number };
