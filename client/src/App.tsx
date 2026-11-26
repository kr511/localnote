import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Subject, View } from './types';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import StudyView from './components/StudyView';
import SearchPalette from './components/SearchPalette';
import Home from './components/Home';

export default function App() {
  const [tree, setTree] = useState<Subject[]>([]);
  const [view, setView] = useState<View>({ type: 'home' });
  const [dueTotal, setDueTotal] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, due] = await Promise.all([api.tree(), api.due()]);
      setTree(t);
      setDueTotal(due.counts.reduce((n, c) => n + c.due, 0));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // If the open page was deleted, fall back to home.
  useEffect(() => {
    if (view.type !== 'page') return;
    const exists = tree.some((s) => s.pages.some((p) => p.id === view.id));
    if (tree.length && !exists) setView({ type: 'home' });
  }, [tree, view]);

  return (
    <div className="flex h-full">
      <Sidebar
        tree={tree}
        view={view}
        dueTotal={dueTotal}
        onNavigate={setView}
        onChanged={refresh}
        onSearch={() => setSearchOpen(true)}
        onError={setError}
      />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        {error && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-red-900/50 bg-red-950/80 px-6 py-2 text-sm text-red-200 backdrop-blur">
            <span>{error}</span>
            <button className="text-red-300 hover:text-white" onClick={() => setError(null)}>
              Schließen
            </button>
          </div>
        )}
        {view.type === 'home' && <Home tree={tree} dueTotal={dueTotal} onNavigate={setView} onChanged={refresh} />}
        {view.type === 'page' && (
          <Editor
            key={view.id}
            pageId={view.id}
            focusBlockId={view.focusBlockId}
            onSaved={refresh}
            onError={setError}
          />
        )}
        {view.type === 'study' && (
          <StudyView
            key={view.subjectId ?? 'all'}
            subjectId={view.subjectId}
            onNavigate={setView}
            onReviewed={refresh}
            onError={setError}
          />
        )}
      </main>
      {searchOpen && (
        <SearchPalette
          onClose={() => setSearchOpen(false)}
          onNavigate={(v) => {
            setView(v);
            setSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}
