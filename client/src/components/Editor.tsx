import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Loader2, Layers } from 'lucide-react';
import { api } from '../api';
import type { Block, PageDetail } from '../types';
import BlockRow from './BlockRow';
import { parseCards } from '../../../shared/parser';
import { indentSubtree, parsePastedLines, subtreeEnd } from '../lib/outline';

interface Props {
  pageId: number;
  focusBlockId?: string;
  onSaved: () => void;
  onError: (msg: string) => void;
}

type FocusReq = { id: string; caret: number | 'end' };
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

const SAVE_DELAY = 400;
const newBlock = (indent = 0, content = ''): Block => ({ id: crypto.randomUUID(), indent, content });

export default function Editor({ pageId, focusBlockId, onSaved, onError }: Props) {
  const [page, setPage] = useState<PageDetail | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [title, setTitle] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [highlight, setHighlight] = useState<string | null>(null);

  const blocksRef = useRef<Block[]>([]);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusReq = useRef<FocusReq | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  // ---------- loading ----------
  useEffect(() => {
    let cancelled = false;
    api
      .getPage(pageId)
      .then((p) => {
        if (cancelled) return;
        const initial = p.blocks.length ? p.blocks : [newBlock()];
        setPage(p);
        setTitle(p.title);
        blocksRef.current = initial;
        setBlocks(initial);
        const target = focusBlockId && initial.some((b) => b.id === focusBlockId) ? focusBlockId : null;
        if (target) {
          setHighlight(target);
          window.setTimeout(() => setHighlight(null), 1600);
        }
        if (target || p.blocks.length === 0) {
          focusReq.current = { id: target ?? initial[0].id, caret: 'end' };
          setFocusTick((t) => t + 1);
        }
      })
      .catch((e) => onError(e.message));
    return () => {
      cancelled = true;
    };
  }, [pageId, focusBlockId, onError]);

  // ---------- saving ----------
  const save = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return chain.current;
    dirty.current = false;
    const snapshot = blocksRef.current;
    setSaveState('saving');
    chain.current = chain.current
      .then(() => api.saveBlocks(pageId, snapshot))
      .then(() => {
        setSaveState(dirty.current ? 'dirty' : 'saved');
        onSaved();
      })
      .catch((e) => {
        dirty.current = true; // retry on next change
        setSaveState('dirty');
        onError(`Speichern fehlgeschlagen: ${e.message}`);
      });
    return chain.current;
  }, [pageId, onSaved, onError]);

  // Flush on unmount / tab close so nothing typed gets lost.
  useEffect(() => {
    const flush = () => {
      if (dirty.current) {
        dirty.current = false;
        api.saveBlocks(pageId, blocksRef.current, true).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.clearTimeout(timer.current);
      flush();
    };
  }, [pageId]);

  const commit = useCallback(
    (next: Block[], focus?: FocusReq) => {
      blocksRef.current = next;
      setBlocks(next);
      dirty.current = true;
      setSaveState('dirty');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(save, SAVE_DELAY);
      if (focus) {
        focusReq.current = focus;
        setFocusTick((t) => t + 1);
      }
    },
    [save],
  );

  // ---------- focus handling ----------
  useLayoutEffect(() => {
    const req = focusReq.current;
    if (!req) return;
    const el = refs.current.get(req.id);
    if (!el) return;
    focusReq.current = null;
    el.focus();
    const pos = req.caret === 'end' ? el.value.length : Math.min(req.caret, el.value.length);
    el.setSelectionRange(pos, pos);
    el.scrollIntoView({ block: 'nearest' });
  }, [focusTick, blocks]);

  const register = useCallback((id: string, el: HTMLTextAreaElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  }, []);

  // ---------- block operations ----------
  const onChange = useCallback(
    (i: number, content: string) => {
      const next = blocksRef.current.slice();
      next[i] = { ...next[i], content };
      commit(next);
    },
    [commit],
  );

  const onKeyDown = useCallback(
    (i: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const bs = blocksRef.current;
      const cur = bs[i];
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: end, value } = el;
      const collapsed = s === end;

      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const next = bs.slice();
        if (s === 0 && end === 0 && value.length > 0) {
          // Caret at start: insert an empty sibling above, keep editing this one.
          next.splice(i, 0, newBlock(cur.indent));
          commit(next, { id: cur.id, caret: 0 });
          return;
        }
        const before = value.slice(0, s);
        const after = value.slice(end);
        const hasChildren = i + 1 < bs.length && bs[i + 1].indent > cur.indent;
        const nb = newBlock(hasChildren && !after ? cur.indent + 1 : cur.indent, after);
        next[i] = { ...cur, content: before };
        next.splice(i + 1, 0, nb);
        commit(next, { id: nb.id, caret: 0 });
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const next = indentSubtree(bs, i, e.shiftKey ? -1 : 1);
        if (next !== bs) commit(next, { id: cur.id, caret: s });
        return;
      }

      if (e.key === 'Backspace' && collapsed && s === 0) {
        if (cur.indent > 0 && value === '') {
          e.preventDefault();
          commit(indentSubtree(bs, i, -1), { id: cur.id, caret: 0 });
          return;
        }
        if (i > 0) {
          e.preventDefault();
          const prev = bs[i - 1];
          const next = bs.slice();
          next[i - 1] = { ...prev, content: prev.content + value };
          next.splice(i, 1);
          commit(next, { id: prev.id, caret: prev.content.length });
        }
        return;
      }

      if (e.key === 'Delete' && collapsed && s === value.length && i + 1 < bs.length) {
        e.preventDefault();
        const nextB = bs[i + 1];
        const next = bs.slice();
        next[i] = { ...cur, content: value + nextB.content };
        next.splice(i + 1, 1);
        commit(next, { id: cur.id, caret: s });
        return;
      }

      // Alt+Shift+Up/Down moves the block together with its children.
      if (e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const endIdx = subtreeEnd(bs, i);
        const chunk = bs.slice(i, endIdx);
        const rest = [...bs.slice(0, i), ...bs.slice(endIdx)];
        let insertAt: number;
        if (e.key === 'ArrowUp') {
          if (i === 0) return;
          // jump over the previous sibling (and its subtree)
          let j = i - 1;
          while (j > 0 && bs[j].indent > cur.indent) j--;
          if (bs[j].indent !== cur.indent) return; // first child: stay inside the parent
          insertAt = j;
        } else {
          if (endIdx >= bs.length || bs[endIdx].indent !== cur.indent) return; // last child
          insertAt = subtreeEnd(rest, i);
        }
        rest.splice(insertAt, 0, ...chunk);
        commit(rest, { id: cur.id, caret: s });
        return;
      }

      if (e.key === 'ArrowUp' && collapsed && !value.slice(0, s).includes('\n') && i > 0) {
        e.preventDefault();
        focusReq.current = { id: bs[i - 1].id, caret: Math.min(s, bs[i - 1].content.length) };
        setFocusTick((t) => t + 1);
        return;
      }
      if (e.key === 'ArrowDown' && collapsed && !value.slice(s).includes('\n') && i + 1 < bs.length) {
        e.preventDefault();
        const lineStart = value.lastIndexOf('\n', s - 1) + 1;
        focusReq.current = { id: bs[i + 1].id, caret: s - lineStart };
        setFocusTick((t) => t + 1);
      }
    },
    [commit],
  );

  const onPaste = useCallback(
    (i: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text.includes('\n')) return; // single line: let the browser handle it
      e.preventDefault();
      const bs = blocksRef.current;
      const cur = bs[i];
      const el = e.currentTarget;
      const before = el.value.slice(0, el.selectionStart);
      const after = el.value.slice(el.selectionEnd);
      const lines = parsePastedLines(text);
      if (lines.length === 0) return;
      const next = bs.slice();
      next[i] = { ...cur, content: before + lines[0].content };
      const inserted = lines.slice(1).map((l) => newBlock(cur.indent + l.indent, l.content));
      next.splice(i + 1, 0, ...inserted);
      const last = inserted.length ? inserted[inserted.length - 1] : next[i];
      const lastIdx = next.indexOf(last);
      const caret = last.content.length;
      next[lastIdx] = { ...last, content: last.content + after };
      commit(next, { id: last.id, caret });
    },
    [commit],
  );

  const renameTitle = async () => {
    const t = title.trim();
    if (!page || !t || t === page.title) {
      setTitle(page?.title ?? '');
      return;
    }
    try {
      await api.renamePage(pageId, t);
      setPage({ ...page, title: t });
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const clickBelow = () => {
    const bs = blocksRef.current;
    const last = bs[bs.length - 1];
    if (last && last.content === '' && last.indent === 0) {
      focusReq.current = { id: last.id, caret: 0 };
      setFocusTick((t) => t + 1);
    } else {
      const nb = newBlock();
      commit([...bs, nb], { id: nb.id, caret: 0 });
    }
  };

  if (!page) return <div className="p-10 text-sm text-zinc-500">Lade…</div>;

  const cardTotal = blocks.reduce((n, b) => n + parseCards(b.content).length, 0);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-10 pb-10 pt-12">
      <div className="mb-1 flex items-center gap-3 text-xs text-zinc-500">
        <span>{page.subjectName}</span>
        <span className="text-zinc-700">/</span>
        <span className="inline-flex items-center gap-1">
          <Layers size={12} /> {cardTotal} {cardTotal === 1 ? 'Karte' : 'Karten'}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          {saveState === 'saving' && (
            <>
              <Loader2 size={12} className="animate-spin" /> Speichert…
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check size={12} /> Gespeichert
            </>
          )}
          {saveState === 'dirty' && <span className="text-zinc-600">Ungespeichert</span>}
        </span>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={renameTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
            const first = blocksRef.current[0];
            if (first) {
              focusReq.current = { id: first.id, caret: 'end' };
              setFocusTick((t) => t + 1);
            }
          }
          if (e.key === 'Escape') {
            setTitle(page.title);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="mb-6 w-full bg-transparent text-3xl font-semibold tracking-tight text-zinc-50 outline-none placeholder:text-zinc-700"
        placeholder="Ohne Titel"
      />
      <div className="space-y-0.5">
        {blocks.map((b, i) => (
          <BlockRow
            key={b.id}
            block={b}
            index={i}
            highlighted={highlight === b.id}
            register={register}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
        ))}
      </div>
      <div className="min-h-32 flex-1 cursor-text" onClick={clickBelow} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/60 pt-3 text-[11px] text-zinc-600">
        <span><kbd>Enter</kbd> neuer Punkt</span>
        <span><kbd>Tab</kbd>/<kbd>Shift Tab</kbd> ein-/ausrücken</span>
        <span><kbd>Shift Enter</kbd> Zeilenumbruch</span>
        <span><kbd>Alt Shift ↑↓</kbd> verschieben</span>
        <span className="text-zinc-500">Frage &gt;&gt; Antwort · Begriff &lt;&lt; Definition · {'{{Lücke}}'}</span>
      </div>
    </div>
  );
}
