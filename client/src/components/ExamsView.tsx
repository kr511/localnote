import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Flame, GraduationCap, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { ExamSummary, Subject, View } from '../types';
import ExamForm from './ExamForm';

interface Props {
  tree: Subject[];
  onNavigate: (v: View) => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}

export function countdown(e: ExamSummary): string {
  if (e.isPast) return 'vorbei';
  if (e.daysLeft === 0) return 'heute';
  if (e.daysLeft === 1) return 'morgen';
  return `in ${e.daysLeft} Tagen`;
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
}

export default function ExamsView({ tree, onNavigate, onChanged, onError }: Props) {
  const [exams, setExams] = useState<ExamSummary[] | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setExams(await api.exams());
    } catch (e) {
      onError((e as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setEditing(null);
      await load();
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const upcoming = exams?.filter((e) => !e.isPast) ?? [];
  const past = exams?.filter((e) => e.isPast) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-10 pb-16 pt-12">
      <div className="mb-8 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Klausuren</h1>
        <button
          onClick={() => setEditing('new')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          <Plus size={15} /> Klausur
        </button>
      </div>

      {editing === 'new' && (
        <div className="mb-6">
          <ExamForm tree={tree} onCancel={() => setEditing(null)} onSubmit={(input) => act(() => api.createExam(input))} />
        </div>
      )}

      {exams && exams.length === 0 && editing !== 'new' && (
        <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center">
          <CalendarClock size={28} className="mx-auto text-zinc-600" />
          <p className="mt-3 text-zinc-300">Noch keine Klausur geplant.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Trag eine ein, dann rechnet LocalNote rückwärts aus, wie viele Karten du pro Tag schaffen solltest.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {upcoming.map((e) =>
          editing === e.id ? (
            <ExamForm
              key={e.id}
              tree={tree}
              initial={e}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => act(() => api.updateExam(e.id, input))}
            />
          ) : (
            <ExamCard
              key={e.id}
              exam={e}
              onEdit={() => setEditing(e.id)}
              onDelete={() => confirm(`Klausur "${e.title}" löschen?`) && act(() => api.deleteExam(e.id))}
              onForceCram={(on) => act(() => api.updateExam(e.id, { cramForced: on }))}
              onNavigate={onNavigate}
            />
          ),
        )}
      </div>

      {past.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-zinc-500">Vergangene Klausuren ({past.length})</summary>
          <div className="mt-3 space-y-1">
            {past.map((e) => (
              <div key={e.id} className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-900">
                <span className="flex-1">
                  {e.title} · {e.subjectName}
                </span>
                <span>{formatDate(e.examDate)}</span>
                <button
                  className="hidden text-zinc-600 hover:text-zinc-200 group-hover:block"
                  onClick={() => confirm(`Klausur "${e.title}" löschen?`) && act(() => api.deleteExam(e.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ExamCard({
  exam: e,
  onEdit,
  onDelete,
  onForceCram,
  onNavigate,
}: {
  exam: ExamSummary;
  onEdit: () => void;
  onDelete: () => void;
  onForceCram: (on: boolean) => void;
  onNavigate: (v: View) => void;
}) {
  const { progress: p, dailyGoal: g } = e;
  const pct = (n: number) => (p.total ? (n / p.total) * 100 : 0);
  const goalDone = g.total > 0 && g.doneToday >= g.total;
  const urgent = e.daysLeft <= 2;

  return (
    <div className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-start gap-4">
        <div
          className={`flex w-20 shrink-0 flex-col items-center rounded-lg py-2 ${
            urgent ? 'bg-orange-500/10 text-orange-300' : 'bg-zinc-800/70 text-zinc-100'
          }`}
        >
          <span className="text-2xl font-semibold leading-none tabular-nums">{e.daysLeft <= 0 ? '!' : e.daysLeft}</span>
          <span className="mt-1 text-[11px] text-zinc-500">{e.daysLeft === 1 ? 'Tag' : e.daysLeft <= 0 ? 'heute' : 'Tage'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-medium text-zinc-100">{e.title}</h2>
            {e.cramActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-300">
                <Flame size={11} /> Cram
              </span>
            )}
            <div className="ml-auto hidden gap-1 group-hover:flex">
              <button title="Bearbeiten" onClick={onEdit} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                <Pencil size={14} />
              </button>
              <button title="Löschen" onClick={onDelete} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-500">
            {e.subjectName} · {formatDate(e.examDate)} · {countdown(e)}
            {e.pageIds.length > 0 && ` · ${e.pageIds.length} Seiten`}
          </p>

          {/* progress */}
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="bg-emerald-500" style={{ width: `${pct(p.mastered)}%` }} />
              <div className="bg-amber-500/80" style={{ width: `${pct(p.shaky)}%` }} />
            </div>
            <div className="mt-1.5 flex gap-4 text-xs text-zinc-500">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {p.mastered} sitzen
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500/80" />
                {p.shaky} wackelig
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-zinc-700" />
                {p.new} neu
              </span>
              <span className="ml-auto">{p.total} Karten</span>
            </div>
          </div>

          {/* daily goal */}
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-zinc-800/40 px-3 py-2 text-sm">
            <Target size={15} className={goalDone ? 'text-emerald-400' : 'text-violet-400'} />
            <span className="text-zinc-300">
              Tagesziel: <span className="font-medium text-zinc-100 tabular-nums">{g.doneToday} / {g.total}</span> Karten
            </span>
            <span className="text-xs text-zinc-500">
              ({g.dueToday} fällig + {g.newPerDay} neue{g.planDays > 1 ? `, verteilt auf ${g.planDays} Tage` : ''})
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate({ type: 'study', examId: e.id })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
            >
              <GraduationCap size={15} /> Lernen
            </button>
            {e.cramActive ? (
              <button
                onClick={() => onNavigate({ type: 'study', examId: e.id, cram: true })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/15 px-3 py-1.5 text-sm font-medium text-orange-200 ring-1 ring-orange-500/30 hover:bg-orange-500/25"
              >
                <Flame size={15} /> Cram-Modus starten
              </button>
            ) : (
              <button
                onClick={() => onForceCram(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-400 ring-1 ring-zinc-700 hover:text-zinc-200"
                title="Normalerweise erst 48 Stunden vor der Klausur"
              >
                <Flame size={15} /> Cram freischalten
              </button>
            )}
            {e.cramForced && (
              <button onClick={() => onForceCram(false)} className="text-xs text-zinc-500 hover:text-zinc-300">
                manuelles Cram aus
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
