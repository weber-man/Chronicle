import type Database from 'better-sqlite3';
import { hashPassword, hashPasswordAsync, verifyPassword } from './auth.js';
import { HttpError } from './errors.js';
import type { Role, SanitizedUser, UserRow } from './types.js';

type CreateUserPayload = {
  name: string;
  color: string;
  email: string;
  password: string;
  role: Role;
};

const DEFAULT_ADMIN_EMAIL = 'admin@lifeline.local';
const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!';
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const WEAK_ADMIN_PASSWORDS = new Set([
  'admin',
  'admin123',
  'admin123!',
  'changeme',
  'changeme123!',
  'password',
  'password123!',
]);

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

export async function createUser(db: Database.Database, payload: CreateUserPayload) {
  const passwordHash = await hashPasswordAsync(payload.password);
  const result = db.prepare(`
    INSERT INTO users (name, color, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(payload.name, payload.color, payload.email.toLowerCase(), passwordHash, payload.role);
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
  const update = db.prepare(`
    UPDATE users
    SET name = COALESCE(@name, name),
        color = COALESCE(@color, color),
        role = COALESCE(@role, role),
        password_hash = COALESCE(@passwordHash, password_hash),
        session_version = session_version + @bumpSession,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  const clearResetTokens = db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?');

  const apply = db.transaction(() => {
    update.run({
      id,
      name: payload.name ?? null,
      color: payload.color ?? null,
      role: payload.role ?? null,
      passwordHash: payload.passwordHash ?? null,
      bumpSession: payload.bumpSession ? 1 : 0,
    });
    if (payload.passwordHash) clearResetTokens.run(id);
  });
  apply();
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

export function assertStrongAdminPassword(password: string) {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD muss mindestens ${MIN_ADMIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  if (WEAK_ADMIN_PASSWORDS.has(password.toLowerCase()) || /^change[-_ ]?me/i.test(password)) {
    throw new Error('ADMIN_PASSWORD ist zu schwach oder ein bekannter Standardwert und wird abgelehnt.');
  }
  if (new Set(password).size < 6) {
    throw new Error('ADMIN_PASSWORD hat zu wenig Zeichenvielfalt und wird abgelehnt.');
  }
}

export function bootstrapAdmin(
  db: Database.Database,
  config: { email?: string; password?: string; name?: string; color?: string },
) {
  if (activeUserCount(db) > 0) return;

  const email = config.email?.trim() || DEFAULT_ADMIN_EMAIL;
  const password = config.password;
  if (!password) {
    throw new Error(
      'ADMIN_PASSWORD muss beim ersten Start gesetzt sein. Es gibt keinen bekannten Standard-Admin mehr. '
      + 'Erzeuge ein starkes Passwort und starte die App erneut.',
    );
  }
  assertStrongAdminPassword(password);

  const name = config.name?.trim() || 'Administrator';
  const color = config.color?.trim() || '#7c3aed';
  const existing = db.prepare('SELECT id, name, color FROM users ORDER BY id ASC LIMIT 1').get() as
    | { id: number; name: string; color: string }
    | undefined;

  if (existing) {
    const update = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET name = ?, color = ?, email = ?, password_hash = ?, role = 'admin',
            session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(existing.name || name, existing.color || color, email, hashPassword(password), existing.id);
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(existing.id);
    });
    update();
    return;
  }

  db.prepare(`
    INSERT INTO users (name, color, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'admin')
  `).run(name, color, email, hashPassword(password));
}

/**
 * Older releases created an administrator with a public default password.
 * Remove that credential before the server starts accepting requests.
 */
export function rotateLegacyDefaultAdmin(db: Database.Database, config: { password?: string }) {
  const admins = db.prepare(`
    SELECT id, email, password_hash as passwordHash
    FROM users
    WHERE role = 'admin' AND password_hash IS NOT NULL
  `).all() as Array<{ id: number; email: string; passwordHash: string }>;
  const affected = admins.filter((row) => verifyPassword(DEFAULT_ADMIN_PASSWORD, row.passwordHash));

  if (!affected.length) return { rotated: 0 };
  if (!config.password) {
    throw new Error(
      'Ein Administrator mit dem bekannten Standard-Passwort wurde gefunden. '
      + 'Setze ADMIN_PASSWORD auf ein starkes Passwort, damit der Standard beim Start ersetzt wird.',
    );
  }
  assertStrongAdminPassword(config.password);

  const passwordHash = hashPassword(config.password);
  const update = db.prepare(`
    UPDATE users
    SET password_hash = ?, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const clearResetTokens = db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?');
  const rotate = db.transaction(() => {
    for (const row of affected) {
      update.run(passwordHash, row.id);
      clearResetTokens.run(row.id);
    }
  });
  rotate();

  return { rotated: affected.length };
}
