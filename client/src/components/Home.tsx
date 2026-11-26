import { ArrowLeftRight, Brackets, GraduationCap, Layers, Plus } from 'lucide-react';
import { api } from '../api';
import type { Subject, View } from '../types';

interface Props {
  tree: Subject[];
  dueTotal: number;
  onNavigate: (v: View) => void;
  onChanged: () => void;
}

export default function Home({ tree, dueTotal, onNavigate, onChanged }: Props) {
  const pages = tree.reduce((n, s) => n + s.pages.length, 0);
  const cards = tree.reduce((n, s) => n + s.pages.reduce((m, p) => m + p.cardCount, 0), 0);

  const quickStart = async () => {
    const s = await api.createSubject('Biologie');
    const p = await api.createPage(s.id, 'Das Herz');
    await api.saveBlocks(p.id, [
      { id: crypto.randomUUID(), indent: 0, content: 'Aufbau' },
      { id: crypto.randomUUID(), indent: 1, content: 'Das Herz hat {{vier}} Kammern.' },
      { id: crypto.randomUUID(), indent: 1, content: 'Was trennt die linke von der rechten Herzhälfte? >> Die Herzscheidewand (Septum)' },
      { id: crypto.randomUUID(), indent: 0, content: 'Herzzyklus' },
      { id: crypto.randomUUID(), indent: 1, content: 'Systole << Anspannungs- und Austreibungsphase des Herzens' },
      { id: crypto.randomUUID(), indent: 1, content: 'Diastole << Entspannungs- und Füllungsphase des Herzens' },
    ]);
    onChanged();
    onNavigate({ type: 'page', id: p.id });
  };

  return (
    <div className="mx-auto max-w-2xl px-10 pt-20">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Willkommen bei LocalNote</h1>
      <p className="mt-2 text-zinc-400">
        {tree.length === 0
          ? 'Leg links dein erstes Fach an, oder starte mit einem Beispiel.'
          : `${plural(tree.length, 'Fach', 'Fächer')}, ${plural(pages, 'Seite', 'Seiten')}, ${plural(cards, 'Karteikarte', 'Karteikarten')}.`}
      </p>

      <div className="mt-8 flex gap-3">
        <button
          onClick={() => onNavigate({ type: 'study' })}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
        >
          <GraduationCap size={16} /> Heute lernen {dueTotal > 0 && <span className="rounded bg-white/20 px-1.5">{dueTotal}</span>}
        </button>
        {tree.length === 0 && (
          <button
            onClick={() => quickStart().catch((e) => alert(e.message))}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            <Plus size={16} /> Beispiel anlegen
          </button>
        )}
      </div>

      <h2 className="mt-14 text-xs font-medium uppercase tracking-wider text-zinc-500">So entstehen Karteikarten</h2>
      <div className="mt-3 divide-y divide-zinc-800/70 rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm">
        {[
          { icon: Layers, code: 'Frage >> Antwort', text: 'normale Karte' },
          { icon: ArrowLeftRight, code: 'Begriff << Definition', text: 'Karte in beide Richtungen' },
          { icon: Brackets, code: 'Das Herz pumpt {{Blut}} durch den Körper.', text: 'Lückentext' },
        ].map(({ icon: Icon, code, text }) => (
          <div key={code} className="flex items-center gap-3 px-4 py-3">
            <Icon size={15} className="text-violet-400" />
            <code className="flex-1 text-zinc-200">{code}</code>
            <span className="text-zinc-500">{text}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xs font-medium uppercase tracking-wider text-zinc-500">Tastatur</h2>
      <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm text-zinc-400">
        <span><kbd>Strg K</kbd> Suche</span>
        <span><kbd>Tab</kbd> / <kbd>Shift Tab</kbd> ein-/ausrücken</span>
        <span><kbd>Leertaste</kbd> Antwort zeigen</span>
        <span><kbd>1</kbd>–<kbd>4</kbd> Nochmal / Schwer / Gut / Einfach</span>
      </div>
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
