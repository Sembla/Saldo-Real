import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'pt-BR',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('personal', 'business')),
    currency TEXT NOT NULL DEFAULT 'BRL',
    locale TEXT NOT NULL DEFAULT 'pt-BR',
    current_balance_cents INTEGER NOT NULL DEFAULT 0,
    emergency_buffer_cents INTEGER NOT NULL DEFAULT 0 CHECK(emergency_buffer_cents >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    category TEXT NOT NULL DEFAULT 'other',
    date TEXT NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK(recurrence IN ('none', 'weekly', 'monthly', 'yearly')),
    recurrence_end TEXT,
    confidence REAL NOT NULL DEFAULT 1 CHECK(confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'paid', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0),
    minimum_payment_cents INTEGER NOT NULL DEFAULT 0 CHECK(minimum_payment_cents >= 0),
    annual_interest_rate REAL,
    due_day INTEGER CHECK(due_day IS NULL OR (due_day BETWEEN 1 AND 31)),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paid', 'paused')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_cents INTEGER NOT NULL CHECK(target_cents > 0),
    current_cents INTEGER NOT NULL DEFAULT 0 CHECK(current_cents >= 0),
    target_date TEXT,
    kind TEXT NOT NULL DEFAULT 'general' CHECK(kind IN ('emergency', 'general', 'purchase', 'debt')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS data_cache (
    cache_key TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_spaces_owner ON spaces(owner_id);
  CREATE INDEX IF NOT EXISTS idx_entries_space_date ON entries(space_id, date);
  CREATE INDEX IF NOT EXISTS idx_debts_space ON debts(space_id);
  CREATE INDEX IF NOT EXISTS idx_goals_space ON goals(space_id);
  `,
];

export function createDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

  const applied = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
      ? db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version)
      : [],
  );

  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1;
    if (applied.has(version)) return;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  return db;
}
