import Database from 'better-sqlite3';

export type DB = Database.Database;

/**
 * Forward-only migrations, tracked via PRAGMA user_version.
 * Never edit an existing entry, always append a new one.
 */
const migrations: string[] = [
  // v1: MVP
  `
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
    id       TEXT PRIMARY KEY,
    page_id  INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    indent   INTEGER NOT NULL DEFAULT 0,
    content  TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_blocks_page ON blocks(page_id, position);

  CREATE TABLE cards (
    id             INTEGER PRIMARY KEY,
    block_id       TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    slot           TEXT NOT NULL,
    kind           TEXT NOT NULL,
    front          TEXT NOT NULL,
    back           TEXT NOT NULL,
    due            TEXT NOT NULL,
    stability      REAL NOT NULL DEFAULT 0,
    difficulty     REAL NOT NULL DEFAULT 0,
    elapsed_days   INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    reps           INTEGER NOT NULL DEFAULT 0,
    lapses         INTEGER NOT NULL DEFAULT 0,
    state          INTEGER NOT NULL DEFAULT 0,
    last_review    TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (block_id, slot)
  );
  CREATE INDEX idx_cards_due ON cards(due);
  CREATE INDEX idx_cards_page ON cards(page_id);

  CREATE TABLE review_logs (
    id             INTEGER PRIMARY KEY,
    card_id        INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    rating         INTEGER NOT NULL,
    state          INTEGER NOT NULL,
    due            TEXT NOT NULL,
    stability      REAL NOT NULL,
    difficulty     REAL NOT NULL,
    scheduled_days INTEGER NOT NULL,
    reviewed_at    TEXT NOT NULL
  );
  CREATE INDEX idx_review_logs_card ON review_logs(card_id, reviewed_at);
  `,
];

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function openDb(file: string): DB {
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // SQLite's LOWER()/LIKE only fold ASCII; this handles Ä/Ö/Ü etc. for search.
  db.function('ulower', { deterministic: true }, (v: unknown) =>
    typeof v === 'string' ? v.toLocaleLowerCase('de') : v,
  );
  migrate(db);
  return db;
}
