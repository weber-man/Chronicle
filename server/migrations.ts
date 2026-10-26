import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

type Migration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

export type MigrationResult = {
  from: number;
  to: number;
  migrated: boolean;
  backupPath: string | null;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'baseline',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          email TEXT,
          password_hash TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT,
          is_ongoing INTEGER NOT NULL DEFAULT 0,
          sort_start TEXT NOT NULL,
          sort_end TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Databases from the first Lifeline versions did not have accounts yet.
      addColumnIfMissing(db, 'users', 'email', 'TEXT');
      addColumnIfMissing(db, 'users', 'password_hash', 'TEXT');
      addColumnIfMissing(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'user'");
      addColumnIfMissing(db, 'users', 'updated_at', 'TEXT');
      addColumnIfMissing(db, 'events', 'description', "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(db, 'events', 'is_ongoing', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, 'events', 'sort_start', "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(db, 'events', 'sort_end', "TEXT NOT NULL DEFAULT ''");
      addColumnIfMissing(db, 'events', 'created_at', 'TEXT');
      addColumnIfMissing(db, 'events', 'updated_at', 'TEXT');

      db.prepare("UPDATE users SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)").run();
      db.prepare("UPDATE events SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)").run();
      db.prepare("UPDATE events SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)").run();
      backfillSortKeys(db);

      createIndexIfPossible(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL', 'users.email');
      createIndexIfPossible(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash)', 'password_reset_tokens.token_hash');
      createIndexIfPossible(db, 'CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id)', 'password_reset_tokens.user_id');
    },
  },
  {
    version: 2,
    name: 'trash-and-session-revocation',
    up(db) {
      addColumnIfMissing(db, 'users', 'session_version', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, 'events', 'deleted_at', 'TEXT');

      createIndexIfPossible(db, 'CREATE INDEX IF NOT EXISTS idx_events_user_start ON events(user_id, sort_start)', 'events.user_id/sort_start');
      createIndexIfPossible(db, 'CREATE INDEX IF NOT EXISTS idx_events_user_deleted_start ON events(user_id, deleted_at, sort_start)', 'events.user_id/deleted_at/sort_start');
      createIndexIfPossible(db, 'CREATE INDEX IF NOT EXISTS idx_events_user_updated ON events(user_id, updated_at)', 'events.user_id/updated_at');
    },
  },
  {
    version: 3,
    name: 'openrouter-settings',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_settings (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          api_key_encrypted TEXT NOT NULL,
          model TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
];

export const latestSchemaVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export function getSchemaVersion(db: Database.Database) {
  return Number(db.pragma('user_version', { simple: true }));
}

export function runMigrations(
  db: Database.Database,
  options: { dbPath: string; backupDir: string; log?: (event: string, meta?: Record<string, unknown>) => void },
): MigrationResult {
  const from = getSchemaVersion(db);
  if (from > latestSchemaVersion) {
    throw new Error(
      `Die Datenbank wurde mit einer neueren Version erstellt (Schema ${from}, unterstützt ${latestSchemaVersion}). Bitte die App aktualisieren.`,
    );
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > from);
  if (!pending.length) {
    return { from, to: from, migrated: false, backupPath: null };
  }

  const backupPath = hasExistingTables(db) && options.dbPath !== ':memory:'
    ? backupDatabase(db, options.dbPath, options.backupDir, `before-v${latestSchemaVersion}`)
    : null;

  const apply = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
      options.log?.('database.migration_applied', { version: migration.version, name: migration.name });
    }
  });
  apply();

  options.log?.('database.migrated', {
    from,
    to: latestSchemaVersion,
    backupPath,
  });

  return { from, to: latestSchemaVersion, migrated: true, backupPath };
}

/**
 * Creates a consistent SQLite snapshot. WAL contents are checkpointed first so
 * the copied file is self-contained even while the app keeps running.
 */
export function backupDatabase(
  db: Database.Database,
  dbPath: string,
  backupDir: string,
  reason = 'manual',
) {
  if (dbPath === ':memory:') return null;

  fs.mkdirSync(backupDir, { recursive: true });
  db.pragma('wal_checkpoint(TRUNCATE)');

  const safeReason = reason.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'manual';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(dbPath, path.extname(dbPath));
  const target = path.join(backupDir, `${base}-${stamp}-${safeReason}.sqlite`);
  fs.copyFileSync(dbPath, target);
  pruneBackups(backupDir, 20);
  return target;
}

function pruneBackups(backupDir: string, keep: number) {
  const entries = fs.readdirSync(backupDir)
    .filter((entry) => entry.endsWith('.sqlite'))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry);
      return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((left, right) => right.mtime - left.mtime);

  for (const entry of entries.slice(keep)) {
    fs.rmSync(entry.fullPath, { force: true });
  }
}

function hasExistingTables(db: Database.Database) {
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM sqlite_master
    WHERE type = 'table' AND name IN ('users', 'events')
  `).get() as { count: number };
  return Number(row.count) > 0;
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createIndexIfPossible(db: Database.Database, sql: string, label: string) {
  try {
    db.exec(sql);
  } catch (error) {
    // Never destroy or rewrite user data just to add an index. The app-level
    // checks still prevent new duplicates; operators can clean up old rows.
    console.warn('[lifeline] database.index_skipped', {
      index: label,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function backfillSortKeys(db: Database.Database) {
  const rows = db.prepare(`
    SELECT id, start_date as startDate, end_date as endDate, sort_start as sortStart, sort_end as sortEnd
    FROM events
  `).all() as Array<{ id: number; startDate: string; endDate: string | null; sortStart: string | null; sortEnd: string | null }>;

  const update = db.prepare('UPDATE events SET sort_start = ?, sort_end = ? WHERE id = ?');
  for (const row of rows) {
    if (row.sortStart && row.sortEnd) continue;
    try {
      const start = JSON.parse(row.startDate) as { precision: 'year' | 'month' | 'day'; year: number; month?: number | null; day?: number | null };
      const end = row.endDate ? JSON.parse(row.endDate) as typeof start : null;
      update.run(
        row.sortStart || dateSortKey(start, false),
        row.sortEnd || dateSortKey(end ?? start, true),
        row.id,
      );
    } catch {
      // Leave malformed legacy dates untouched; they remain visible and can be
      // repaired manually instead of being dropped during an upgrade.
    }
  }
}

function dateSortKey(
  date: { precision: 'year' | 'month' | 'day'; year: number; month?: number | null; day?: number | null },
  end: boolean,
) {
  const month = date.precision === 'year' ? (end ? 12 : 1) : date.month ?? (end ? 12 : 1);
  const day = date.precision === 'day'
    ? date.day ?? (end ? daysInMonth(date.year, month) : 1)
    : end
      ? daysInMonth(date.year, month)
      : 1;
  return `${String(date.year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
