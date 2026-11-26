import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Brackets, CheckCircle2, Flame, Layers, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { CramExam, DueCount, ExamSummary, StudyCard, View } from '../types';
import FeynmanPanel from './FeynmanPanel';
import { CLOZE_PLACEHOLDER } from '../../../shared/parser';

interface Props {
  subjectId?: number;
  examId?: number;
  cram?: boolean;
  onNavigate: (v: View) => void;
  onReviewed: () => void;
  onError: (msg: string) => void;
}

export const RATINGS = [
  { value: 1, label: 'Nochmal', cls: 'text-red-300 hover:bg-red-500/10 ring-red-500/30' },
  { value: 2, label: 'Schwer', cls: 'text-amber-300 hover:bg-amber-500/10 ring-amber-500/30' },
  { value: 3, label: 'Gut', cls: 'text-emerald-300 hover:bg-emerald-500/10 ring-emerald-500/30' },
  { value: 4, label: 'Einfach', cls: 'text-sky-300 hover:bg-sky-500/10 ring-sky-500/30' },
] as const;

/** Cards that come back within this window are re-queued in the same session. */
const REQUEUE_MS = 20 * 60 * 1000;
/** Cram: how many cards later a card comes back after "Nochmal" / "Schwer". */
const CRAM_REQUEUE: Record<number, number> = { 1: 3, 2: 6 };

export function isTypingTarget(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export function CardFace({ card, revealed }: { card: StudyCard; revealed: boolean }) {
  if (card.kind === 'cloze') {
    const [a, b] = card.front.split(CLOZE_PLACEHOLDER);
    return (
      <p className="text-2xl leading-relaxed text-zinc-100">
        {a}
        {revealed ? (
          <span className="rounded bg-violet-500/20 px-1 font-medium text-violet-200">{card.back}</span>
        ) : (
          <span className="rounded bg-zinc-800 px-2 text-zinc-500">…</span>
        )}
        {b}
      </p>
    );
  }
  return (
    <div>
      <p className="text-2xl leading-relaxed text-zinc-100">{card.front}</p>
      {revealed && (
        <>
          <div className="my-6 h-px bg-zinc-800" />
          <p className="whitespace-pre-wrap text-xl leading-relaxed text-violet-100">{card.back}</p>
        </>
      )}
    </div>
  );
}

export const KIND_ICON = { basic: Layers, reverse: ArrowLeftRight, cloze: Brackets } as const;

export default function StudyView({ subjectId, examId, cram, onNavigate, onReviewed, onError }: Props) {
  const [queue, setQueue] = useState<StudyCard[] | null>(null);
  const [counts, setCounts] = useState<DueCount[]>([]);
  const [cramExams, setCramExams] = useState<CramExam[]>([]);
  const [exam, setExam] = useState<ExamSummary | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [feynman, setFeynman] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (examId && cram) {
        const res = await api.examCram(examId);
        setExam(res.exam);
        setQueue(res.cards);
      } else if (examId) {
        const res = await api.examDue(examId);
        setExam(res.exam);
        setQueue(res.cards);
      } else {
        const res = await api.due(subjectId);
        setQueue(res.cards);
        setCounts(res.counts);
        setCramExams(res.cramExams);
      }
      setRevealed(false);
      setFeynman(false);
    } catch (e) {
      onError((e as Error).message);
      setQueue([]);
    }
  }, [subjectId, examId, cram, onError]);

  useEffect(() => {
    load();
    // Make sure Space doesn't re-trigger whatever button was clicked to get here.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [load]);

  const card = queue?.[0];
  const canFeynman = !!card && card.kind !== 'cloze';

  const rate = useCallback(
    async (rating: number) => {
      if (!card || !revealed || busy) return;
      setBusy(true);
      try {
        const res = await api.review(card.id, rating, cram && examId ? { examId } : undefined);
        setQueue((q) => {
          if (!q) return q;
          const rest = q.slice(1);
          if (cram) {
            const gap = CRAM_REQUEUE[rating];
            if (gap) rest.splice(Math.min(gap, rest.length), 0, res.card);
          } else if (new Date(res.due).getTime() - Date.now() < REQUEUE_MS) {
            // Learning steps (e.g. "Nochmal" -> 1 Min) come back in this session.
            rest.push(res.card);
          }
          return rest;
        });
        setDone((d) => d + 1);
        setRevealed(false);
        setFeynman(false);
        onReviewed();
        if (!examId)
          api
            .due(subjectId)
            .then((r) => setCounts(r.counts))
            .catch(() => {});
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [card, revealed, busy, cram, examId, subjectId, onReviewed, onError],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (card) setRevealed(true);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        rate(Number(e.key));
      } else if (e.key.toLowerCase() === 'f' && canFeynman && !revealed) {
        e.preventDefault();
        setFeynman(true);
      } else if (e.key === 'Escape' && feynman) {
        setFeynman(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, rate, canFeynman, revealed, feynman]);

  const totalDue = counts.reduce((n, c) => n + c.due, 0);
  const Icon = card ? KIND_ICON[card.kind] : Layers;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-10 pb-10 pt-12">
      {/* header */}
      {exam ? (
        <div className="mb-8 flex items-center gap-3">
          {cram && <Flame size={20} className="text-orange-400" />}
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
              {cram ? 'Cram-Modus' : 'Lernen für'}: {exam.title}
            </h1>
            <p className="text-sm text-zinc-500">
              {exam.subjectName} ·{' '}
              {exam.hoursLeft > 0 && exam.hoursLeft < 72
                ? `noch ${Math.round(exam.hoursLeft)} Std`
                : exam.daysLeft > 0
                  ? `noch ${exam.daysLeft} Tage`
                  : 'heute'}
              {cram && ' · schwache Karten zuerst, dein FSRS-Plan bleibt unberührt'}
            </p>
          </div>
          <button className="ml-auto text-sm text-zinc-500 hover:text-zinc-200" onClick={() => onNavigate({ type: 'exams' })}>
            Zur Übersicht
          </button>
        </div>
      ) : (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <h1 className="mr-4 text-xl font-semibold tracking-tight text-zinc-50">Heute lernen</h1>
          <Chip active={!subjectId} onClick={() => onNavigate({ type: 'study' })}>
            Alle <span className="text-zinc-500">{totalDue}</span>
          </Chip>
          {counts.map((c) => (
            <Chip key={c.subjectId} active={subjectId === c.subjectId} onClick={() => onNavigate({ type: 'study', subjectId: c.subjectId })}>
              {c.name} <span className="text-zinc-500">{c.due}</span>
            </Chip>
          ))}
        </div>
      )}

      {!exam &&
        cramExams.map((e) => (
          <div key={e.id} className="mb-4 flex items-center gap-3 rounded-lg bg-orange-500/10 px-4 py-2.5 text-sm ring-1 ring-orange-500/20">
            <Flame size={16} className="text-orange-400" />
            <span className="text-orange-100">
              {e.title} ({e.subjectName}) steht kurz bevor. Der Cram-Modus ist freigeschaltet.
            </span>
            <button
              className="ml-auto shrink-0 whitespace-nowrap rounded-md bg-orange-500/20 px-3 py-1 text-orange-100 hover:bg-orange-500/30"
              onClick={() => onNavigate({ type: 'study', examId: e.id, cram: true })}
            >
              Cram starten
            </button>
          </div>
        ))}

      {queue === null && <p className="text-sm text-zinc-500">Lade…</p>}

      {queue && !card && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <CheckCircle2 size={40} className="text-emerald-400" />
          <p className="text-lg text-zinc-100">
            {cram
              ? done > 0
                ? `Runde geschafft, ${done} Abfragen.`
                : 'Keine Karten im Klausur-Stoff.'
              : done > 0
                ? `Stark, ${done} Karten erledigt.`
                : 'Gerade ist nichts fällig.'}
          </p>
          {!cram && (
            <p className="max-w-sm text-sm text-zinc-500">
              Neue Karten entstehen automatisch, wenn du in deinen Notizen <code className="text-zinc-400">Frage &gt;&gt; Antwort</code>,{' '}
              <code className="text-zinc-400">Begriff &lt;&lt; Definition</code> oder <code className="text-zinc-400">{'{{Lücke}}'}</code> schreibst.
            </p>
          )}
          <button className="mt-2 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100" onClick={load}>
            <RotateCcw size={14} /> {cram ? 'Nochmal von vorn' : 'Neu laden'}
          </button>
        </div>
      )}

      {card && (
        <div className="flex flex-1 flex-col">
          <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
            <Icon size={13} />
            <button className="hover:text-zinc-300" onClick={() => onNavigate({ type: 'page', id: card.pageId })}>
              {card.subjectName} / {card.pageTitle}
            </button>
            {card.state === 0 && <span className="rounded bg-violet-500/15 px-1.5 text-violet-300">neu</span>}
            <span className="ml-auto">
              {done} erledigt · {queue!.length} übrig
            </span>
          </div>

          <div className={`min-h-64 rounded-xl border bg-zinc-900/50 p-10 ${cram ? 'border-orange-500/20' : 'border-zinc-800'}`}>
            <CardFace card={card} revealed={revealed} />
          </div>

          {feynman && (
            <FeynmanPanel
              key={card.id}
              card={card}
              onResult={() => setRevealed(true)}
              onClose={() => setFeynman(false)}
              onNavigate={onNavigate}
            />
          )}

          <div className="mt-6">
            {!revealed ? (
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-lg bg-zinc-800 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
                  onClick={() => setRevealed(true)}
                >
                  Antwort zeigen <kbd className="ml-2">Leertaste</kbd>
                </button>
                {canFeynman && !feynman && (
                  <button
                    className="inline-flex items-center gap-2 rounded-lg px-4 text-sm text-violet-300 ring-1 ring-violet-500/30 hover:bg-violet-500/10"
                    onClick={() => setFeynman(true)}
                    title="Erklär die Antwort in eigenen Worten, eine lokale KI gibt dir Feedback"
                  >
                    <Sparkles size={15} /> Frei erklären <kbd>F</kbd>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    disabled={busy}
                    onClick={() => rate(r.value)}
                    className={`flex flex-col items-center gap-0.5 rounded-lg py-2.5 text-sm font-medium ring-1 transition-colors disabled:opacity-50 ${r.cls}`}
                  >
                    <span>
                      <kbd className="mr-1.5">{r.value}</kbd>
                      {r.label}
                    </span>
                    <span className="text-[11px] font-normal text-zinc-500">
                      {cram ? (r.value === 1 ? 'gleich nochmal' : r.value === 2 ? 'etwas später' : 'für heute ok') : card.intervals[r.value]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs transition-colors ${
        active ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}
