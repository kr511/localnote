import { useState } from 'react';
import type { ExamInput, ExamSummary, Subject } from '../types';

interface Props {
  tree: Subject[];
  initial?: ExamSummary;
  onSubmit: (input: ExamInput) => Promise<void>;
  onCancel: () => void;
}

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ExamForm({ tree, initial, onSubmit, onCancel }: Props) {
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? tree[0]?.id ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [examDate, setExamDate] = useState(initial?.examDate ?? todayPlus(14));
  const [pageIds, setPageIds] = useState<number[]>(initial?.pageIds ?? []);
  const [busy, setBusy] = useState(false);

  const subject = tree.find((s) => s.id === subjectId);
  const togglePage = (id: number) => setPageIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  if (tree.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
        Leg zuerst links ein Fach mit ein paar Notizen an, dann kannst du eine Klausur dafür planen.
        <button className="ml-3 text-zinc-300 underline" onClick={onCancel}>
          OK
        </button>
      </div>
    );
  }

  const input = 'w-full rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700/60 focus:ring-violet-500/60';

  return (
    <form
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !subjectId) return;
        setBusy(true);
        try {
          // only keep pages that still belong to the chosen subject
          const valid = pageIds.filter((id) => subject?.pages.some((p) => p.id === id));
          await onSubmit({ subjectId, title: title.trim(), examDate, pageIds: valid });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-[1fr_1fr_160px] gap-3">
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Titel / Thema</span>
          <input autoFocus className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Herz-Kreislauf" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Fach</span>
          <select
            className={input}
            value={subjectId}
            onChange={(e) => {
              setSubjectId(Number(e.target.value));
              setPageIds([]);
            }}
          >
            {tree.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-zinc-500">Datum</span>
          <input type="date" className={input} value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
        </label>
      </div>

      {subject && subject.pages.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500">
            Stoff: {pageIds.length === 0 ? 'ganzes Fach' : `${pageIds.length} von ${subject.pages.length} Seiten`}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {subject.pages.map((p) => {
              const on = pageIds.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => togglePage(p.id)}
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition-colors ${
                    on ? 'bg-violet-500/20 text-violet-200 ring-violet-500/40' : 'text-zinc-400 ring-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {p.title} <span className="text-zinc-500">{p.cardCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100">
          Abbrechen
        </button>
        <button
          disabled={busy || !title.trim()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {initial ? 'Speichern' : 'Klausur anlegen'}
        </button>
      </div>
    </form>
  );
}
