# LocalNote

Schlanke, 100% lokale RemNote-Alternative für die Schule. Notizen als Outliner, Karteikarten werden automatisch aus dem Text erkannt, gelernt wird mit FSRS. Kein Login, keine Cloud, alle Daten in einer SQLite-Datei (`localnote.db`).

## Startbefehle

```bash
npm install          # einmalig, installiert Server + Client (npm workspaces)
npm run dev          # startet API (Port 3001) + Vite (Port 5173) parallel, App: http://localhost:5173
npm start            # Produktion: baut den Client und startet nur den Server, App: http://localhost:3001
npm test             # Backend-Tests (Vitest + Supertest, In-Memory-DB)
npm run typecheck    # TypeScript-Check für Server und Client
npm run build        # Client-Build nach client/dist
```

Umgebungsvariablen (alle optional):

| Variable | Default | Zweck |
| --- | --- | --- |
| `PORT` | `3001` | Port des API-Servers |
| `LOCALNOTE_DB` | `./localnote.db` (Repo-Root) | Pfad zur SQLite-Datei |

## Architektur

```
Browser (React + Vite + Tailwind)
   │  fetch /api/*   (Vite-Proxy im Dev, gleicher Origin in Prod)
   ▼
Express-Server (TypeScript, tsx)
   │  better-sqlite3 (synchron, eine Verbindung, WAL)
   ▼
localnote.db
```

- **Monorepo mit npm workspaces**: `server/` und `client/`. Root-`package.json` hat nur Orchestrierung (`concurrently`).
- **Speichern**: Der Editor schickt nach 400 ms ohne Tippen die komplette Blockliste der Seite an `PUT /api/pages/:id/blocks`. Der Server ersetzt die Blöcke in einer Transaktion und synchronisiert danach die Karten der Seite.
- **Karten-Sync**: `server/src/parser.ts` erkennt Karten pro Block. Jede Karte hat einen stabilen Schlüssel `(block_id, slot)`. Ändert sich nur der Text, bleibt der FSRS-Zustand erhalten. Verschwindet ein Slot, wird die Karte gelöscht.
- **Block-IDs** erzeugt der Client (`crypto.randomUUID()`), damit Speichern idempotent ist und Karten ihren Block behalten.
- **Outliner flach gespeichert**: Blöcke sind eine geordnete Liste mit `indent` (0..n) statt eines echten Baums. Das macht Tab/Shift+Tab, Umsortieren und Speichern trivial; die Hierarchie ergibt sich aus Reihenfolge + Einrückung.
- **FSRS**: `server/src/srs.ts` kapselt `ts-fsrs`. Der Client rechnet nichts selbst, er bekommt fällige Karten inkl. Intervall-Vorschau pro Bewertung und schickt nur die Bewertung 1 bis 4 zurück.

## Karteikarten-Syntax

| Eingabe | Ergebnis | Slots |
| --- | --- | --- |
| `Frage >> Antwort` | normale Karte | `basic` |
| `Begriff << Definition` | Karte in beide Richtungen | `fwd`, `rev` |
| `Das Herz pumpt {{Blut}} durch den Körper.` | Lückentext, eine Karte pro Lücke | `c0`, `c1`, ... |

Reihenfolge der Erkennung: `>>` vor `<<` vor `{{...}}`. Beide Seiten müssen nicht leer sein, sonst entsteht keine Karte. Bei Cloze steht auf der Vorderseite der Satz mit `[…]` an der gefragten Stelle, die Rückseite ist der gesuchte Begriff.

## Ordnerstruktur

```
localnote/
├── CLAUDE.md
├── README.md
├── package.json              # workspaces + dev/start/test-Skripte
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts          # Einstieg: DB öffnen, App starten, in Prod client/dist ausliefern
│   │   ├── app.ts            # createApp(db): Express-App mit allen Routen (testbar)
│   │   ├── db.ts             # openDb(), Schema + Migrationen
│   │   ├── parser.ts         # Karten-Erkennung aus Blocktext
│   │   ├── srs.ts            # FSRS-Wrapper (ts-fsrs)
│   │   ├── cards.ts          # syncPageCards(): Blöcke -> Karten
│   │   └── routes/
│   │       ├── subjects.ts   # Fächer CRUD
│   │       ├── pages.ts      # Seiten CRUD + Blöcke speichern
│   │       ├── study.ts      # fällige Karten, Bewertung
│   │       └── search.ts     # Strg+K-Suche
│   └── test/                 # Vitest
└── client/
    ├── package.json
    ├── vite.config.ts        # Proxy /api -> :3001, Tailwind-Plugin
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx           # Layout: Sidebar | Hauptbereich, globale Shortcuts
        ├── api.ts            # typisierte fetch-Wrapper
        ├── types.ts          # geteilte Typen (Subject, Page, Block, Card, ...)
        ├── lib/parse.ts      # gleiche Karten-Erkennung wie Server, nur fürs Badge
        └── components/
            ├── Sidebar.tsx       # Fächer- und Seitenbaum
            ├── Editor.tsx        # Outliner, Debounce-Speichern
            ├── BlockRow.tsx      # ein Block: Textarea, Badge, Tastatur
            ├── StudyView.tsx     # "Heute lernen"
            └── SearchPalette.tsx # Strg+K
```

## Datenbank-Schema

```sql
CREATE TABLE subjects (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pages (
  id         INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE blocks (
  id       TEXT PRIMARY KEY,               -- UUID vom Client
  page_id  INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  indent   INTEGER NOT NULL DEFAULT 0,
  content  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE cards (
  id             INTEGER PRIMARY KEY,
  block_id       TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  slot           TEXT NOT NULL,            -- basic | fwd | rev | c0, c1, ...
  kind           TEXT NOT NULL,            -- basic | reverse | cloze
  front          TEXT NOT NULL,
  back           TEXT NOT NULL,
  -- FSRS-Zustand (Felder wie ts-fsrs Card)
  due            TEXT NOT NULL,            -- ISO-Zeitstempel
  stability      REAL NOT NULL DEFAULT 0,
  difficulty     REAL NOT NULL DEFAULT 0,
  elapsed_days   INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  state          INTEGER NOT NULL DEFAULT 0, -- 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (block_id, slot)
);

CREATE TABLE review_logs (
  id          INTEGER PRIMARY KEY,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL,            -- 1 Nochmal, 2 Schwer, 3 Gut, 4 Einfach
  state       INTEGER NOT NULL,            -- Zustand VOR der Bewertung
  due         TEXT NOT NULL,               -- neues Fälligkeitsdatum
  stability   REAL NOT NULL,
  difficulty  REAL NOT NULL,
  scheduled_days INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL
);
```

Indizes: `blocks(page_id, position)`, `cards(due)`, `cards(page_id)`, `review_logs(card_id, reviewed_at)`.
Migrationen laufen über `PRAGMA user_version` in `db.ts` (jede Version ein SQL-Block, nur vorwärts).

## API (alles JSON unter `/api`)

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/tree` | alle Fächer inkl. Seiten (für die Sidebar) |
| POST | `/subjects` | `{name}` |
| PATCH | `/subjects/:id` | `{name}` |
| DELETE | `/subjects/:id` | löscht Fach mit allen Seiten/Karten |
| POST | `/pages` | `{subjectId, title}` |
| GET | `/pages/:id` | Seite + Blöcke + Karten-Anzahl pro Block |
| PATCH | `/pages/:id` | `{title}` |
| DELETE | `/pages/:id` | |
| PUT | `/pages/:id/blocks` | `{blocks: [{id, indent, content}]}` in Reihenfolge, gibt Karten-Infos zurück |
| GET | `/study/due?subjectId=` | fällige Karten (+ Intervall-Vorschau), Zähler pro Fach |
| POST | `/study/:cardId/review` | `{rating: 1..4}` -> FSRS, speichert Karte + Log |
| GET | `/search?q=` | Treffer in Seitentiteln und Blöcken |

## Konventionen

- Sprache der UI: Deutsch. Code und Bezeichner: Englisch.
- Server: keine ORMs, nur Prepared Statements. Jede Route validiert Eingaben selbst und antwortet bei Fehlern mit `{error}` und passendem Status.
- Client: kein State-Management-Framework, React-State + kleine Hooks. Icons nur aus `lucide-react`.
- Design: Dark Mode, Farben über Tailwind (`zinc` für Flächen, `violet` als Akzent), ruhig, wenig Rahmen.
- Neue Tabellen/Spalten immer als neue Migration in `db.ts` anhängen, nie bestehende Migrationen ändern.
- Nach Änderungen: `npm test` und `npm run typecheck` müssen grün sein.
