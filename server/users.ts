import type Database from 'better-sqlite3';
import { hashPassword } from './auth.js';
import { HttpError } from './errors.js';
import type { Role, SanitizedUser, UserRow } from './types.js';

type CreateUserPayload = {
  name: string;
  color: string;
  email: string;
  password: string;
  role: Role;
};

const USER_COLUMNS = `
  id,
  name,
  color,
  email,
  password_hash as passwordHash,
  role,
  session_version as sessionVersion,
  created_at as createdAt,
  updated_at as updatedAt
`;

export function getUserRowByEmail(db: Database.Database, email: string) {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower(?)`).get(email) as UserRow | undefined;
}

export function getUserRowById(db: Database.Database, id: number) {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

export function getUserById(db: Database.Database, id: number) {
  const row = getUserRowById(db, id);
  return row ? sanitizeUser(row) : null;
}

export function getUserSession(db: Database.Database, id: number) {
  const row = getUserRowById(db, id);
  if (!row) return null;
  return { user: sanitizeUser(row), sessionVersion: Number(row.sessionVersion ?? 0) };
}

export function sanitizeUser(row: Pick<UserRow, 'id' | 'name' | 'color' | 'email' | 'role' | 'createdAt'>): SanitizedUser {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
  };
}

export function createUser(db: Database.Database, payload: CreateUserPayload) {
  const result = db.prepare(`
    INSERT INTO users (name, color, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(payload.name, payload.color, payload.email.toLowerCase(), hashPassword(payload.password), payload.role);
  return getUserById(db, Number(result.lastInsertRowid))!;
}

export function listUsers(db: Database.Database) {
  return (db.prepare(`
    SELECT id, name, color, email, role, created_at as createdAt
    FROM users
    ORDER BY created_at ASC, id ASC
  `).all() as Array<Pick<UserRow, 'id' | 'name' | 'color' | 'email' | 'role' | 'createdAt'>>)
    .map(sanitizeUser);
}

export function updateUserDetails(
  db: Database.Database,
  id: number,
  payload: {
    name?: string | null;
    color?: string | null;
    role?: Role | null;
    passwordHash?: string | null;
    bumpSession?: boolean;
  },
) {
  db.prepare(`
    UPDATE users
    SET name = COALESCE(@name, name),
        color = COALESCE(@color, color),
        role = COALESCE(@role, role),
        password_hash = COALESCE(@passwordHash, password_hash),
        session_version = session_version + @bumpSession,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id,
    name: payload.name ?? null,
    color: payload.color ?? null,
    role: payload.role ?? null,
    passwordHash: payload.passwordHash ?? null,
    bumpSession: payload.bumpSession ? 1 : 0,
  });
}

export function deleteUser(db: Database.Database, id: number) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function activeUserCount(db: Database.Database) {
  return Number((db.prepare('SELECT COUNT(*) as count FROM users WHERE email IS NOT NULL').get() as { count: number }).count);
}

export function adminCount(db: Database.Database) {
  return Number((db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count);
}

export function ensureUniqueEmail(db: Database.Database, email: string) {
  const existing = getUserRowByEmail(db, email);
  if (existing) throw new HttpError(409, 'E-Mail ist bereits vergeben.');
}

export function bootstrapAdmin(
  db: Database.Database,
  config: { email?: string; password?: string; name?: string; color?: string },
) {
  if (activeUserCount(db) > 0) return;

  const email = config.email ?? 'admin@lifeline.local';
  const password = config.password ?? 'ChangeMe123!';
  const name = config.name ?? 'Administrator';
  const color = config.color ?? '#7c3aed';
  const existing = db.prepare('SELECT id, name, color FROM users ORDER BY id ASC LIMIT 1').get() as
    | { id: number; name: string; color: string }
    | undefined;

  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = ?, color = ?, email = ?, password_hash = ?, role = 'admin', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.name || name, existing.color || color, email, hashPassword(password), existing.id);
    return;
  }

  db.prepare(`
    INSERT INTO users (name, color, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'admin')
  `).run(name, color, email, hashPassword(password));
}
