import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderClosed,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type { Subject, View } from '../types';
import InlineInput from './InlineInput';

interface Props {
  tree: Subject[];
  view: View;
  dueTotal: number;
  onNavigate: (v: View) => void;
  onChanged: () => Promise<void> | void;
  onSearch: () => void;
  onError: (msg: string) => void;
}

type Editing = { kind: 'subject' | 'page'; id: number } | { kind: 'new-subject' } | { kind: 'new-page'; subjectId: number };

export default function Sidebar({ tree, view, dueTotal, onNavigate, onChanged, onSearch, onError }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const toggle = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const navItem = (active: boolean) =>
    `group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
      active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
    }`;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900/40">
      <button
        className="flex items-center gap-2 px-4 pb-3 pt-4 text-left"
        onClick={() => onNavigate({ type: 'home' })}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-white">
          <BookOpen size={14} />
        </div>
        <span className="font-semibold tracking-tight text-zinc-100">LocalNote</span>
      </button>

      <div className="space-y-0.5 px-2">
        <button className={navItem(false)} onClick={onSearch}>
          <Search size={15} />
          <span className="flex-1">Suchen</span>
          <kbd>Strg K</kbd>
        </button>
        <button className={navItem(view.type === 'study')} onClick={() => onNavigate({ type: 'study' })}>
          <GraduationCap size={15} />
          <span className="flex-1">Heute lernen</span>
          {dueTotal > 0 && (
            <span className="rounded-full bg-violet-500/20 px-1.5 text-xs font-medium text-violet-300">{dueTotal}</span>
          )}
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Fächer</span>
        <button
          title="Neues Fach"
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          onClick={() => setEditing({ kind: 'new-subject' })}
        >
          <Plus size={15} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {tree.map((s) => {
          const open = !collapsed.has(s.id);
          const isEditing = editing?.kind === 'subject' && editing.id === s.id;
          return (
            <div key={s.id}>
              <div className={navItem(false)}>
                {isEditing ? (
                  <div className="flex flex-1 items-center gap-1.5">
                    <ChevronDown size={14} />
                    <FolderClosed size={14} className="text-zinc-500" />
                    <InlineInput
                      initial={s.name}
                      onSubmit={(name) => run(() => api.renameSubject(s.id, name)).then(() => setEditing(null))}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  <button className="flex flex-1 items-center gap-1.5 truncate" onClick={() => toggle(s.id)}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <FolderClosed size={14} className="text-zinc-500" />
                    <span className="truncate">{s.name}</span>
                  </button>
                )}
                <div className="hidden items-center gap-0.5 group-hover:flex">
                  <IconBtn title="Neue Seite" onClick={() => setEditing({ kind: 'new-page', subjectId: s.id })}>
                    <Plus size={13} />
                  </IconBtn>
                  <IconBtn title="Umbenennen" onClick={() => setEditing({ kind: 'subject', id: s.id })}>
                    <Pencil size={13} />
                  </IconBtn>
                  <IconBtn
                    title="Löschen"
                    onClick={() => {
                      if (confirm(`Fach "${s.name}" mit allen ${s.pages.length} Seiten und Karten löschen?`))
                        run(() => api.deleteSubject(s.id));
                    }}
                  >
                    <Trash2 size={13} />
                  </IconBtn>
                </div>
              </div>

              {open && (
                <div className="ml-4 border-l border-zinc-800 pl-1.5">
                  {s.pages.map((p) => {
                    const active = view.type === 'page' && view.id === p.id;
                    const editingPage = editing?.kind === 'page' && editing.id === p.id;
                    return (
                      <div key={p.id} className={navItem(active)}>
                        {editingPage ? (
                          <div className="flex flex-1 items-center gap-1.5">
                            <FileText size={13} className="shrink-0 text-zinc-500" />
                            <InlineInput
                              initial={p.title}
                              onSubmit={(t) => run(() => api.renamePage(p.id, t)).then(() => setEditing(null))}
                              onCancel={() => setEditing(null)}
                            />
                          </div>
                        ) : (
                          <button
                            className="flex flex-1 items-center gap-1.5 truncate"
                            onClick={() => onNavigate({ type: 'page', id: p.id })}
                          >
                            <FileText size={13} className="shrink-0 text-zinc-500" />
                            <span className="truncate">{p.title}</span>
                          </button>
                        )}
                        {p.cardCount > 0 && (
                          <span className="text-[11px] text-zinc-600 group-hover:hidden">{p.cardCount}</span>
                        )}
                        <div className="hidden items-center gap-0.5 group-hover:flex">
                          <IconBtn title="Umbenennen" onClick={() => setEditing({ kind: 'page', id: p.id })}>
                            <Pencil size={13} />
                          </IconBtn>
                          <IconBtn
                            title="Löschen"
                            onClick={() => {
                              if (confirm(`Seite "${p.title}" und ihre Karten löschen?`)) run(() => api.deletePage(p.id));
                            }}
                          >
                            <Trash2 size={13} />
                          </IconBtn>
                        </div>
                      </div>
                    );
                  })}
                  {editing?.kind === 'new-page' && editing.subjectId === s.id && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm">
                      <FileText size={13} className="text-zinc-500" />
                      <InlineInput
                        initial=""
                        placeholder="Seitentitel"
                        onSubmit={async (title) => {
                          try {
                            const p = await api.createPage(s.id, title);
                            setEditing(null);
                            await onChanged();
                            onNavigate({ type: 'page', id: p.id });
                          } catch (e) {
                            onError((e as Error).message);
                          }
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  )}
                  {s.pages.length === 0 && editing?.kind !== 'new-page' && (
                    <button
                      className="px-2 py-1 text-xs text-zinc-600 hover:text-zinc-400"
                      onClick={() => setEditing({ kind: 'new-page', subjectId: s.id })}
                    >
                      + Seite anlegen
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {editing?.kind === 'new-subject' && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm">
            <FolderClosed size={14} className="text-zinc-500" />
            <InlineInput
              initial=""
              placeholder="Fachname, z. B. Biologie"
              onSubmit={(name) => run(() => api.createSubject(name)).then(() => setEditing(null))}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
        {tree.length === 0 && editing?.kind !== 'new-subject' && (
          <button
            className="w-full rounded-md border border-dashed border-zinc-800 px-3 py-3 text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            onClick={() => setEditing({ kind: 'new-subject' })}
          >
            + Erstes Fach anlegen
          </button>
        )}
      </nav>
    </aside>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <span
      role="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100"
    >
      {children}
    </span>
  );
}
