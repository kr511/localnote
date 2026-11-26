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
npm run desktop      # Desktop-App (Electron) starten
npm run dist:win     # Windows-.exe bauen (Setup + portable) nach desktop/release/
```

Umgebungsvariablen (alle optional):

| Variable | Default | Zweck |
| --- | --- | --- |
| `PORT` | `3001` | Port des API-Servers |
| `LOCALNOTE_DB` | `./localnote.db` (Repo-Root) | Pfad zur SQLite-Datei |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama-Server für den Feynman-Check |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Modell für den Feynman-Check |

Reihenfolge für Ollama-Einstellungen: Wert aus der Tabelle `settings` (in der App unter Einstellungen) > Umgebungsvariable > Default.

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
- **Ein Parser für beide Seiten**: `shared/parser.ts` wird vom Server (Karten-Sync) und vom Client (Badge beim Tippen) importiert. Nie duplizieren.
- **Nur localhost**: Der Server bindet an `127.0.0.1`, weil es keine Authentifizierung gibt.
- **Block-IDs** erzeugt der Client (`crypto.randomUUID()`), damit Speichern idempotent ist und Karten ihren Block behalten.
- **Outliner flach gespeichert**: Blöcke sind eine geordnete Liste mit `indent` (0..n) statt eines echten Baums. Das macht Tab/Shift+Tab, Umsortieren und Speichern trivial; die Hierarchie ergibt sich aus Reihenfolge + Einrückung.
- **FSRS**: `server/src/srs.ts` kapselt `ts-fsrs` (Fuzz an). Der Client rechnet nichts selbst, er bekommt fällige Karten inkl. Intervall-Vorschau pro Bewertung und schickt nur die Bewertung 1 bis 4 zurück. Die Antwort enthält die aktualisierte Karte; ist sie in unter 20 Minuten wieder fällig (Lernschritte), hängt der Client sie hinten an die aktuelle Session an.
- **Suche**: `LIKE` über eine eigene SQL-Funktion `ulower()` (registriert in `db.ts`), weil SQLites `LOWER()` keine Umlaute faltet.

## Desktop-App (Windows-.exe)

- `desktop/` ist **kein** npm-Workspace, sondern ein eigenständiges Paket mit eigener `package-lock.json` (Electron, electron-builder, esbuild, better-sqlite3).
- `desktop/src/main.ts` startet über `startServer()` aus `server/src/server.ts` denselben Express-Server auf `127.0.0.1` mit freiem Port und lädt ihn in ein `BrowserWindow`. Kein IPC, kein Preload: die UI spricht wie im Browser per `fetch('/api')`.
- `desktop/build.mjs` bündelt Main-Prozess + Server mit esbuild nach `desktop/dist/main.cjs` (extern: `electron`, `better-sqlite3`) und kopiert `client/dist` nach `desktop/dist/client`.
- DB-Pfad in der App: `app.getPath('userData')/localnote.db` (Windows: `%APPDATA%\LocalNote`), überschreibbar mit `LOCALNOTE_DB`.
- better-sqlite3 (ab v13) bringt N-API-Prebuilds für alle Plattformen mit. Deshalb `npmRebuild: false` in der electron-builder-Config, und die Prebuilds werden aus dem asar entpackt (`asarUnpack`).
- Single-Instance-Lock: ein zweiter Start fokussiert das vorhandene Fenster. Externe Links öffnen im System-Browser.
- Mikrofon im Feynman-Panel ist in Electron ausgeblendet (die Web-Speech-API hat dort keinen Dienst dahinter).
- Release: `.github/workflows/desktop.yml` baut auf `windows-latest` bei jedem PR (Artefakt) und bei Tags `v*` (GitHub Release mit `LocalNote-Setup-x.y.z.exe` und `LocalNote-x.y.z-portable.exe`). Die .exe ist nicht code-signiert, SmartScreen warnt beim ersten Start.

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
├── shared/
│   └── parser.ts             # Karten-Erkennung, von Server UND Client importiert (eine Quelle)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts          # CLI-Einstieg (npm run dev / npm start)
│   │   ├── server.ts         # startServer(): DB öffnen, App starten, optional client/dist ausliefern
│   │   ├── app.ts            # createApp(db): Express-App mit allen Routen (testbar)
│   │   ├── db.ts             # openDb(), Schema + Migrationen
│   │   ├── parser.ts         # re-exportiert shared/parser.ts
│   │   ├── http.ts           # HttpError, Validierungshelfer, Error-Middleware
│   │   ├── srs.ts            # FSRS-Wrapper (ts-fsrs)
│   │   ├── cards.ts          # syncPageCards(): Blöcke -> Karten
│   │   ├── exams.ts          # Klausur-Statistik: Scope, Fortschritt, Tagesziel, Cram-Priorität
│   │   ├── ollama.ts         # Ollama-Client (Status, Chat mit JSON-Schema, freundliche Fehler)
│   │   ├── feynman.ts        # Prompt bauen, Antwort validieren
│   │   └── routes/
│   │       ├── subjects.ts   # Fächer CRUD
│   │       ├── pages.ts      # Seiten CRUD + Blöcke speichern
│   │       ├── study.ts      # fällige Karten, Bewertung
│   │       ├── search.ts     # Strg+K-Suche
│   │       ├── exams.ts      # Klausuren CRUD, Übersicht, Cram-Warteschlange
│   │       ├── feynman.ts    # Feynman-Check
│   │       └── settings.ts   # Einstellungen (Ollama)
│   └── test/                 # Vitest
├── desktop/                  # Electron-Hülle, eigenständiges Paket (kein Workspace)
│   ├── src/main.ts           # Fenster + eingebetteter Server
│   ├── build.mjs             # esbuild-Bundle + Client kopieren
│   └── build/icon.png        # App-Icon
├── .github/workflows/desktop.yml  # Windows-Build + Release
└── client/
    ├── package.json
    ├── vite.config.ts        # Proxy /api -> :3001, Tailwind-Plugin
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx           # Layout: Sidebar | Hauptbereich, globale Shortcuts
        ├── api.ts            # typisierte fetch-Wrapper
        ├── types.ts          # geteilte Typen (Subject, Page, Block, Card, ...)
        ├── lib/outline.ts    # Outliner-Logik: Teilbaum ein-/ausrücken, Einfügen von Listen
        └── components/
            ├── Sidebar.tsx       # Fächer- und Seitenbaum
            ├── Editor.tsx        # Outliner, Debounce-Speichern
            ├── BlockRow.tsx      # ein Block: Textarea, Badge, Tastatur
            ├── StudyView.tsx     # "Heute lernen"
            ├── SearchPalette.tsx # Strg+K
            ├── Home.tsx          # Startseite / leerer Zustand
            ├── ExamsView.tsx     # Klausuren: Countdown, Fortschritt, Tagesziel, Cram
            ├── ExamForm.tsx      # Klausur anlegen/bearbeiten
            ├── FeynmanPanel.tsx  # "Frei erklären" im Lernmodus (Text + optional Mikrofon)
            ├── SettingsView.tsx  # Ollama-URL/Modell, Verbindungstest
            └── InlineInput.tsx   # Anlegen/Umbenennen in der Sidebar
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

### Migration 2: Klausuren, Cram, Feynman

```sql
CREATE TABLE exams (
  id          INTEGER PRIMARY KEY,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  exam_date   TEXT NOT NULL,               -- 'YYYY-MM-DD', lokales Datum
  cram_forced INTEGER NOT NULL DEFAULT 0,  -- Cram manuell freigeschaltet
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE exam_pages (                  -- leer = ganzes Fach
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, page_id)
);

ALTER TABLE review_logs ADD COLUMN is_cram INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_logs ADD COLUMN exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL;

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE feynman_attempts (
  id          INTEGER PRIMARY KEY,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  explanation TEXT NOT NULL,
  score       INTEGER NOT NULL,
  feedback    TEXT NOT NULL,               -- JSON {correct[], missing[], question}
  model       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
| POST | `/study/:cardId/review` | `{rating: 1..4}` -> FSRS, speichert Karte + Log, gibt `{due, state, card}` zurück |
| GET | `/search?q=` | Treffer in Seitentiteln und Blöcken (leeres `q`: zuletzt bearbeitete Seiten) |
| GET | `/health` | `{ok: true}` |

| GET | `/exams` | alle Klausuren inkl. Countdown, Fortschritt, Tagesziel, Cram-Status |
| POST | `/exams` | `{subjectId, title, examDate: 'YYYY-MM-DD', pageIds?: number[]}` |
| PATCH | `/exams/:id` | Teilupdate, auch `{cramForced: boolean}` |
| DELETE | `/exams/:id` | |
| GET | `/exams/:id/due` | regulär fällige Karten (FSRS) nur aus dem Klausur-Stoff |
| GET | `/exams/:id/cram` | Cram-Warteschlange (409, wenn Cram nicht aktiv) |
| POST | `/study/:cardId/review` | zusätzlich `{cram: true, examId}`: nur Log, FSRS-Zustand bleibt unangetastet |
| GET | `/settings` | effektive Ollama-Einstellungen + Quelle (db/env/default) |
| PUT | `/settings` | `{ollamaUrl?, ollamaModel?}`, leerer String setzt zurück |
| GET | `/feynman/status` | erreicht Ollama? Modell installiert? Liste der Modelle |
| POST | `/feynman/check` | `{cardId, explanation}` -> `{score, correct[], missing[], question, model}` |

## Klausuren-Autopilot

- **Zeitpunkt**: Eine Klausur gilt als am `exam_date` um 08:00 Uhr Ortszeit (Server-Zeit = Rechner des Nutzers).
- **Stoff (Scope)**: verknüpfte Seiten aus `exam_pages`, sonst alle Seiten des Fachs.
- **Fortschritt** pro Karte im Scope:
  - `neu`: noch nie gelernt (State New)
  - `sitzt`: State Review und vorhergesagte Abrufwahrscheinlichkeit (FSRS-Retrievability) **am Klausurtag** ≥ 85 %, falls bis dahin nicht mehr wiederholt wird
  - `wackelig`: alles andere
- **Tagesziel**: `heute fällig im Scope + ceil(neue Karten / Planungstage)`, mit `Planungstage = max(1, Tage bis Klausur - 1)`. Der letzte Tag bleibt frei für Wiederholung/Cram. `heute erledigt` zählt verschiedene Karten im Scope mit Review heute (auch Cram).
- **Cram-Modus** ist aktiv, wenn die Klausur in ≤ 48 Stunden ist (und noch nicht vorbei) oder `cram_forced = 1`.
  - Reihenfolge: zuletzt mit 1 bewertet > zuletzt mit 2 bewertet > Learning/Relearning oder wackelig > neu > Rest. Innerhalb eines Topfs nach aktueller Retrievability aufsteigend.
  - Cram-Bewertungen landen nur in `review_logs` mit `is_cram = 1` und ändern **nie** Stabilität, Schwierigkeit oder Fälligkeit. Das reguläre FSRS-Intervall bleibt intakt, "Heute lernen" läuft normal weiter.
  - In der Session: 1 kommt nach 3 Karten wieder, 2 nach 6 Karten, 3/4 ist für diese Runde erledigt.

## Feynman-Check (Ollama)

- Im Lernmodus bei `basic`- und `reverse`-Karten: Taste `F` (vor dem Aufdecken) öffnet "Frei erklären". Mikrofon über die Web-Speech-API, falls der Browser sie hat (Chrome/Edge), sonst nur Textfeld. Achtung: Chrome/Edge schicken die Audiodaten an ihre Server, das steht so auch im Tooltip und in der README.
- Server baut den Prompt aus Vorderseite, Rückseite (Musterlösung) und Kontext-Notizen: Elternblöcke und direkte Unterpunkte des Kartenblocks (max. 12 Zeilen).
- Aufruf: `POST {OLLAMA_URL}/api/chat` mit `stream: false`, `format` = JSON-Schema, `temperature 0.2`, Timeout 120 s. Die Schülererklärung steht als Daten im Prompt, Anweisungen darin werden ignoriert.
- Antwort wird validiert und geklemmt (Score 0 bis 100, Listen max. 6 Einträge). Ergebnis wird in `feynman_attempts` gespeichert.
- Fehler sind nie ein Absturz, sondern `503/504/502` mit `code`: `ollama_offline`, `model_missing`, `ollama_timeout`, `ollama_bad_response`, die der Client freundlich anzeigt.
- Tests nutzen einen Fake-Ollama-Server (`server/test/fake-ollama.ts`), kein echtes Modell nötig.

## Konventionen

- Sprache der UI: Deutsch. Code und Bezeichner: Englisch.
- Server: keine ORMs, nur Prepared Statements. Jede Route validiert Eingaben selbst und antwortet bei Fehlern mit `{error}` und passendem Status.
- Client: kein State-Management-Framework, React-State + kleine Hooks. Icons nur aus `lucide-react`.
- Design: Dark Mode, Farben über Tailwind (`zinc` für Flächen, `violet` als Akzent), ruhig, wenig Rahmen.
- Neue Tabellen/Spalten immer als neue Migration in `db.ts` anhängen, nie bestehende Migrationen ändern.
- Nach Änderungen: `npm test` und `npm run typecheck` müssen grün sein.
