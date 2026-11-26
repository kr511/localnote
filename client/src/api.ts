import type {
  Block,
  CramExam,
  DueCount,
  ExamInput,
  ExamSummary,
  FeynmanFeedback,
  OllamaStatus,
  PageDetail,
  PageSummary,
  SearchResult,
  Settings,
  StudyCard,
  Subject,
} from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Server nicht erreichbar. Läuft "npm run dev"?');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Fehler ${res.status}`, data.code);
  return data as T;
}

export const api = {
  tree: () => req<Subject[]>('GET', '/tree'),
  createSubject: (name: string) => req<Subject>('POST', '/subjects', { name }),
  renameSubject: (id: number, name: string) => req('PATCH', `/subjects/${id}`, { name }),
  deleteSubject: (id: number) => req('DELETE', `/subjects/${id}`),

  createPage: (subjectId: number, title: string) => req<PageSummary>('POST', '/pages', { subjectId, title }),
  getPage: (id: number) => req<PageDetail>('GET', `/pages/${id}`),
  renamePage: (id: number, title: string) => req('PATCH', `/pages/${id}`, { title }),
  deletePage: (id: number) => req('DELETE', `/pages/${id}`),
  saveBlocks: (id: number, blocks: Block[], keepalive = false) =>
    req<{ cards: Record<string, { kind: string; count: number }> }>('PUT', `/pages/${id}/blocks`, { blocks }, { keepalive }),

  due: (subjectId?: number) =>
    req<{ cards: StudyCard[]; counts: DueCount[]; cramExams: CramExam[] }>(
      'GET',
      `/study/due${subjectId ? `?subjectId=${subjectId}` : ''}`,
    ),
  review: (cardId: number, rating: number, cram?: { examId: number }) =>
    req<{ id: number; due: string; state: number; card: StudyCard; cram?: boolean }>(
      'POST',
      `/study/${cardId}/review`,
      cram ? { rating, cram: true, examId: cram.examId } : { rating },
    ),

  exams: () => req<ExamSummary[]>('GET', '/exams'),
  createExam: (input: ExamInput) => req<ExamSummary>('POST', '/exams', input),
  updateExam: (id: number, patch: Partial<ExamInput> & { cramForced?: boolean }) =>
    req<ExamSummary>('PATCH', `/exams/${id}`, patch),
  deleteExam: (id: number) => req('DELETE', `/exams/${id}`),
  examDue: (id: number) => req<{ exam: ExamSummary; cards: StudyCard[] }>('GET', `/exams/${id}/due`),
  examCram: (id: number) =>
    req<{ exam: ExamSummary; cards: (StudyCard & { cramPriority: number })[] }>('GET', `/exams/${id}/cram`),

  settings: () => req<Settings>('GET', '/settings'),
  saveSettings: (s: { ollamaUrl?: string; ollamaModel?: string }) => req<Settings>('PUT', '/settings', s),
  feynmanStatus: () => req<OllamaStatus>('GET', '/feynman/status'),
  feynmanCheck: (cardId: number, explanation: string) =>
    req<FeynmanFeedback>('POST', '/feynman/check', { cardId, explanation }),

  search: (q: string) => req<SearchResult>('GET', `/search?q=${encodeURIComponent(q)}`),
};
