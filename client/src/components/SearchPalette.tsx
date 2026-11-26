import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, FileText, GraduationCap, Search, TextQuote } from 'lucide-react';
import { api } from '../api';
import type { SearchResult, View } from '../types';

interface Props {
  onClose: () => void;
  onNavigate: (v: View) => void;
}

interface Item {
  key: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  hint: string;
  view: View;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const i = text.toLocaleLowerCase('de').indexOf(q.toLocaleLowerCase('de'));
  if (i === -1) return text;
  // keep a window around the match so long blocks stay readable
  const start = Math.max(0, i - 40);
  const pre = (start > 0 ? '…' : '') + text.slice(start, i);
  return (
    <>
      {pre}
      <mark className="rounded bg-violet-500/30 text-violet-100">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, i + q.length + 80)}
    </>
  );
}

export default function SearchPalette({ onClose, onNavigate }: Props) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult>({ pages: [], blocks: [] });
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      api
        .search(q)
        .then((r) => alive && (setRes(r), setSel(0)))
        .catch(() => {});
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const term = q.trim();
    if (!term || 'heute lernen'.includes(term.toLowerCase())) {
      out.push({
        key: 'study',
        icon: <GraduationCap size={15} />,
        title: 'Heute lernen',
        hint: 'Aktion',
        view: { type: 'study' },
      });
    }
    for (const p of res.pages)
      out.push({
        key: `p${p.pageId}`,
        icon: <FileText size={15} />,
        title: highlight(p.title, term),
        hint: p.subjectName,
        view: { type: 'page', id: p.pageId },
      });
    for (const b of res.blocks)
      out.push({
        key: `b${b.blockId}`,
        icon: <TextQuote size={15} />,
        title: highlight(b.content, term),
        hint: `${b.subjectName} / ${b.title}`,
        view: { type: 'page', id: b.pageId, focusBlockId: b.blockId },
      });
    return out;
  }, [res, q]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && items[sel]) {
      e.preventDefault();
      onNavigate(items[sel].view);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
          <Search size={16} className="text-zinc-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Seiten und Notizen durchsuchen…"
            className="h-12 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <kbd>Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500">Nichts gefunden.</p>}
          {!q.trim() && res.pages.length > 0 && (
            <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-zinc-600">Zuletzt bearbeitet</p>
          )}
          {items.map((it, i) => (
            <button
              key={it.key}
              data-idx={i}
              onMouseMove={() => setSel(i)}
              onClick={() => onNavigate(it.view)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                i === sel ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'
              }`}
            >
              <span className="shrink-0 text-zinc-500">{it.icon}</span>
              <span className="min-w-0 flex-1 truncate">{it.title}</span>
              <span className="shrink-0 truncate text-xs text-zinc-500">{it.hint}</span>
              {i === sel && <CornerDownLeft size={13} className="shrink-0 text-zinc-500" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
