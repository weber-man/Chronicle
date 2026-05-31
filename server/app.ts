import cors from 'cors';
import Database from 'better-sqlite3';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createCsrfToken, createResetToken, hashPassword, hashResetToken, signAccessToken, tokenTtlSeconds, verifyAccessToken, verifyPassword } from './auth.js';

export interface AppOptions {
  dbPath?: string;
  jwtSecret?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
  adminColor?: string;
  allowRegistration?: boolean;
  secureCookies?: boolean;
}

type Role = 'admin' | 'user';

type TimelineDate = {
  precision: 'year' | 'month' | 'day';
  year: number;
  month?: number | null;
  day?: number | null;
};

type SanitizedUser = {
  id: number;
  name: string;
  color: string;
  email: string;
  role: Role;
  createdAt: string;
};

const timelineDateSchema = z.object({
  precision: z.enum(['year', 'month', 'day']),
  year: z.number().int().min(0).max(9999),
  month: z.number().int().min(1).max(12).nullable().optional(),
  day: z.number().int().min(1).max(31).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.precision !== 'year' && !value.month) {
    ctx.addIssue({ code: 'custom', path: ['month'], message: 'Monat fehlt.' });
  }
  if (value.precision === 'day' && !value.day) {
    ctx.addIssue({ code: 'custom', path: ['day'], message: 'Tag fehlt.' });
  }
});

const eventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  category: z.string().trim().min(1).max(200).default('Alltag'),
  startDate: timelineDateSchema,
  endDate: timelineDateSchema.nullable(),
  isOngoing: z.boolean().default(false),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  email: z.string().trim().email(),
  password: z.string().min(12).max(200),
});

const createUserSchema = registerSchema.extend({
  role: z.enum(['admin', 'user']).default('user'),
});

const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  currentPassword: z.string().min(8).max(200).optional(),
  newPassword: z.string().min(12).max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.newPassword && !value.currentPassword) {
    ctx.addIssue({ code: 'custom', path: ['currentPassword'], message: 'Aktuelles Passwort fehlt.' });
  }
});

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(200),
});

const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  role: z.enum(['admin', 'user']).optional(),
  password: z.string().min(12).max(200).optional(),
});

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password: z.string().min(12).max(200),
});

declare global {
  namespace Express {
    interface Request {
      auth?: SanitizedUser;
    }
  }
}

const AUTH_COOKIE = 'lifeline_auth';
const CSRF_COOKIE = 'lifeline_csrf';
const PASSWORD_RESET_TTL_MINUTES = 30;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 8;
const RESET_ATTEMPT_LIMIT = 5;

export function createApp(options: AppOptions = {}) {
  const app = express();
  const dbPath = options.dbPath ?? defaultDbPath();
  const clientDistPath = path.join(process.cwd(), 'dist');
  const clientIndexPath = path.join(clientDistPath, 'index.html');
  const dbDir = path.dirname(dbPath);
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET ?? 'dev-only-lifeline-secret-change-me';
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === 'production';
  const allowRegistration = options.allowRegistration ?? process.env.ALLOW_REGISTRATION !== 'false';
  const exposeResetToken = process.env.NODE_ENV !== 'production' || process.env.PASSWORD_RESET_DEBUG === 'true';
  const authLimiter = createRateLimiter();

  logInfo('startup.database_ready', {
    dbPath,
    environment: process.env.NODE_ENV ?? 'development',
    allowRegistration,
    frontendBundled: fs.existsSync(clientIndexPath),
  });

  ensureSchema(db);
  bootstrapAdmin(db, {
    email: options.adminEmail ?? process.env.ADMIN_EMAIL,
    password: options.adminPassword ?? process.env.ADMIN_PASSWORD,
    name: options.adminName ?? process.env.ADMIN_NAME,
    color: options.adminColor ?? process.env.ADMIN_COLOR,
  });

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(securityHeaders);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/config', (_req, res) => {
    res.json({ allowRegistration });
  });

  app.use((req, _res, next) => {
    const token = readCookie(req.headers.cookie, AUTH_COOKIE);
    if (!token) return next();
    try {
      const payload = verifyAccessToken(token, jwtSecret);
      const user = getUserById(db, Number(payload.sub));
      if (user) req.auth = user;
    } catch {
      req.auth = undefined;
    }
    next();
  });

  app.post('/api/auth/register', authLimiter('register', LOGIN_ATTEMPT_LIMIT), (req, res) => {
    if (!allowRegistration) {
      logWarn('auth.register_blocked', requestMeta(req, { reason: 'registration_disabled' }));
      return res.status(403).json({ message: 'Registrierung ist deaktiviert.' });
    }
    const payload = registerSchema.parse(req.body);
    ensureUniqueEmail(db, payload.email);

    const role: Role = activeUserCount(db) === 0 ? 'admin' : 'user';
    const created = createUser(db, { ...payload, role });
    logInfo('auth.register_success', requestMeta(req, { userId: created.id, email: created.email, role: created.role }));
    attachAuthCookies(res, created, jwtSecret, secureCookies);
    res.status(201).json({ user: created, csrfToken: readSetCookieValue(res, CSRF_COOKIE) });
  });

  app.post('/api/auth/login', authLimiter('login', LOGIN_ATTEMPT_LIMIT), (req, res) => {
    const payload = loginSchema.parse(req.body);
    const row = getUserRowByEmail(db, payload.email);
    if (!row?.passwordHash || !verifyPassword(payload.password, row.passwordHash)) {
      logWarn('auth.login_failed', requestMeta(req, { email: payload.email, reason: 'invalid_credentials' }));
      return res.status(401).json({ message: 'E-Mail oder Passwort falsch.' });
    }

    const user = sanitizeUser(row);
    logInfo('auth.login_success', requestMeta(req, { userId: user.id, email: user.email, role: user.role }));
    attachAuthCookies(res, user, jwtSecret, secureCookies);
    res.json({ user, csrfToken: readSetCookieValue(res, CSRF_COOKIE) });
  });

  app.post('/api/auth/logout', (req, res) => {
    logInfo('auth.logout', requestMeta(req, { userId: req.auth?.id ?? null }));
    clearAuthCookies(res, secureCookies);
    res.json({ ok: true });
  });

  app.post('/api/auth/password-reset/request', authLimiter('password-reset-request', RESET_ATTEMPT_LIMIT), (req, res) => {
    const payload = passwordResetRequestSchema.parse(req.body);
    const row = getUserRowByEmail(db, payload.email);

    if (row?.passwordHash) {
      deletePasswordResetTokensForUser(db, row.id);
      const rawToken = createResetToken();
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
      `).run(row.id, hashResetToken(rawToken), expiresAt);

      logInfo('auth.password_reset_requested', requestMeta(req, { userId: row.id, email: payload.email }));

      return res.json({
        ok: true,
        message: 'Falls ein passender Account existiert, wurde ein Reset gestartet.',
        ...(exposeResetToken ? { resetToken: rawToken, expiresAt } : {}),
      });
    }

    logWarn('auth.password_reset_requested_unknown_email', requestMeta(req, { email: payload.email }));

    return res.json({ ok: true, message: 'Falls ein passender Account existiert, wurde ein Reset gestartet.' });
  });

  app.post('/api/auth/password-reset/confirm', authLimiter('password-reset-confirm', RESET_ATTEMPT_LIMIT), (req, res) => {
    const payload = passwordResetConfirmSchema.parse(req.body);
    const tokenRow = db.prepare(`
      SELECT id, user_id as userId, expires_at as expiresAt, used_at as usedAt
      FROM password_reset_tokens
      WHERE token_hash = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(hashResetToken(payload.token)) as { id: number; userId: number; expiresAt: string; usedAt: string | null } | undefined;

    if (!tokenRow || tokenRow.usedAt || new Date(tokenRow.expiresAt).getTime() < Date.now()) {
      logWarn('auth.password_reset_failed', requestMeta(req, { reason: 'invalid_or_expired_token' }));
      return res.status(400).json({ message: 'Reset-Token ist ungültig oder abgelaufen.' });
    }

    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashPassword(payload.password), tokenRow.userId);
    db.prepare(`UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`).run(tokenRow.id);
    deletePasswordResetTokensForUser(db, tokenRow.userId, tokenRow.id);
    logInfo('auth.password_reset_success', requestMeta(req, { userId: tokenRow.userId }));
    clearAuthCookies(res, secureCookies);
    return res.json({ ok: true, message: 'Passwort wurde zurückgesetzt. Bitte neu anmelden.' });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.auth });
  });

  app.use('/api', requireCsrfForWrites);

  app.get('/api/events', requireAuth, (req, res) => {
    const events = getEvents(db, req.auth!.id);
    res.json({ events, summary: getSummary(events) });
  });

  app.post('/api/events', requireAuth, (req, res) => {
    const payload = eventSchema.parse(req.body);
    const normalized = normalizeEvent({ ...payload, userId: req.auth!.id });
    const result = db.prepare(`
      INSERT INTO events (user_id, title, description, category, start_date, end_date, is_ongoing, sort_start, sort_end)
      VALUES (@userId, @title, @description, @category, @startDate, @endDate, @isOngoing, @sortStart, @sortEnd)
    `).run(normalized);

    logInfo('events.created', requestMeta(req, { userId: req.auth!.id, eventId: Number(result.lastInsertRowid), title: payload.title }));
    res.status(201).json(getEventById(db, Number(result.lastInsertRowid), req.auth!.id));
  });

  app.put('/api/events/:id', requireAuth, (req, res) => {
    const payload = eventSchema.parse(req.body);
    const eventId = Number(req.params.id);
    ensureEventOwner(db, eventId, req.auth!.id);
    const normalized = normalizeEvent({ ...payload, userId: req.auth!.id });
    db.prepare(`
      UPDATE events
      SET title = @title,
          description = @description,
          category = @category,
          start_date = @startDate,
          end_date = @endDate,
          is_ongoing = @isOngoing,
          sort_start = @sortStart,
          sort_end = @sortEnd,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @userId
    `).run({ ...normalized, id: eventId });

    logInfo('events.updated', requestMeta(req, { userId: req.auth!.id, eventId, title: payload.title }));
    res.json(getEventById(db, eventId, req.auth!.id));
  });

  app.delete('/api/events/:id', requireAuth, (req, res) => {
    const eventId = Number(req.params.id);
    ensureEventOwner(db, eventId, req.auth!.id);
    db.prepare('DELETE FROM events WHERE id = ? AND user_id = ?').run(eventId, req.auth!.id);
    logInfo('events.deleted', requestMeta(req, { userId: req.auth!.id, eventId }));
    res.json({ ok: true });
  });

  app.get('/api/account', requireAuth, (req, res) => {
    res.json({ user: req.auth });
  });

  app.patch('/api/account', requireAuth, (req, res) => {
    const payload = updateAccountSchema.parse(req.body);
    const row = getUserRowById(db, req.auth!.id);
    if (!row) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });

    if (payload.newPassword) {
      if (!row.passwordHash || !payload.currentPassword || !verifyPassword(payload.currentPassword, row.passwordHash)) {
        return res.status(400).json({ message: 'Aktuelles Passwort ist falsch.' });
      }
    }

    db.prepare(`
      UPDATE users
      SET name = COALESCE(@name, name),
          color = COALESCE(@color, color),
          password_hash = COALESCE(@passwordHash, password_hash),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id: req.auth!.id,
      name: payload.name ?? null,
      color: payload.color ?? null,
      passwordHash: payload.newPassword ? hashPassword(payload.newPassword) : null,
    });

    const updated = getUserById(db, req.auth!.id);
    res.json({ user: updated });
  });

  app.delete('/api/account', requireAuth, (req, res) => {
    const payload = deleteAccountSchema.parse(req.body);
    const row = getUserRowById(db, req.auth!.id);
    if (!row?.passwordHash || !verifyPassword(payload.password, row.passwordHash)) {
      logWarn('account.delete_failed', requestMeta(req, { userId: req.auth!.id, reason: 'invalid_password' }));
      return res.status(400).json({ message: 'Passwort ist falsch.' });
    }

    if (row.role === 'admin' && adminCount(db) <= 1) {
      logWarn('account.delete_failed', requestMeta(req, { userId: req.auth!.id, reason: 'last_admin' }));
      return res.status(400).json({ message: 'Der letzte Administrator kann nicht gelöscht werden.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.auth!.id);
    logInfo('account.deleted', requestMeta(req, { userId: req.auth!.id, email: row.email }));
    clearAuthCookies(res, secureCookies);
    res.json({ ok: true });
  });

  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    res.json({ users: listUsers(db) });
  });

  app.post('/api/admin/users', requireAdmin, (req, res) => {
    const payload = createUserSchema.parse(req.body);
    ensureUniqueEmail(db, payload.email);
    const user = createUser(db, payload);
    logInfo('admin.user_created', requestMeta(req, { actorUserId: req.auth!.id, userId: user.id, email: user.email, role: user.role }));
    res.status(201).json({ user });
  });

  app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
    const payload = adminUpdateUserSchema.parse(req.body);
    const userId = Number(req.params.id);
    const row = getUserRowById(db, userId);
    if (!row) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    if (row.role === 'admin' && payload.role === 'user' && adminCount(db) <= 1) {
      return res.status(400).json({ message: 'Der letzte Administrator darf nicht herabgestuft werden.' });
    }

    db.prepare(`
      UPDATE users
      SET name = COALESCE(@name, name),
          color = COALESCE(@color, color),
          role = COALESCE(@role, role),
          password_hash = COALESCE(@passwordHash, password_hash),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id: userId,
      name: payload.name ?? null,
      color: payload.color ?? null,
      role: payload.role ?? null,
      passwordHash: payload.password ? hashPassword(payload.password) : null,
    });

    logInfo('admin.user_updated', requestMeta(req, { actorUserId: req.auth!.id, userId }));
    res.json({ user: getUserById(db, userId) });
  });

  if (fs.existsSync(clientIndexPath)) {
    app.use(express.static(clientDistPath, { index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(clientIndexPath);
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      logWarn('request.validation_failed', requestMeta(_req, { message: error.issues[0]?.message ?? 'Ungültige Eingabe.' }));
      return res.status(400).json({ message: error.issues[0]?.message ?? 'Ungültige Eingabe.' });
    }

    if (error instanceof AuthError) {
      logWarn('request.auth_failed', requestMeta(_req, { status: error.status, message: error.message }));
      return res.status(error.status).json({ message: error.message });
    }

    if (error instanceof Error) {
      logError('request.failed', requestMeta(_req, { message: error.message, stack: error.stack }));
      return res.status(400).json({ message: error.message });
    }

    logError('request.failed_unknown', requestMeta(_req));
    return res.status(500).json({ message: 'Unbekannter Serverfehler.' });
  });

  return { app, db };
}

function defaultDbPath() {
  return path.join(process.cwd(), 'data', 'lifeline.sqlite');
}

function requestMeta(req: express.Request, extra: Record<string, unknown> = {}) {
  return {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.auth?.id ?? null,
    ...extra,
  };
}

function logInfo(event: string, meta: Record<string, unknown> = {}) {
  console.info(`[lifeline] ${event}`, meta);
}

function logWarn(event: string, meta: Record<string, unknown> = {}) {
  console.warn(`[lifeline] ${event}`, meta);
}

function logError(event: string, meta: Record<string, unknown> = {}) {
  console.error(`[lifeline] ${event}`, meta);
}

function ensureSchema(db: Database.Database) {
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

  addColumnIfMissing(db, 'users', 'email', 'TEXT');
  addColumnIfMissing(db, 'users', 'password_hash', 'TEXT');
  addColumnIfMissing(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'user'");
  addColumnIfMissing(db, 'users', 'updated_at', 'TEXT');
  db.prepare("UPDATE users SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)").run();
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id)');
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function bootstrapAdmin(db: Database.Database, config: { email?: string; password?: string; name?: string; color?: string }) {
  if (activeUserCount(db) > 0) return;

  const email = config.email ?? 'admin@lifeline.local';
  const password = config.password ?? 'ChangeMe123!';
  const name = config.name ?? 'Administrator';
  const color = config.color ?? '#7c3aed';
  const existing = db.prepare('SELECT id, name, color FROM users ORDER BY id ASC LIMIT 1').get() as { id: number; name: string; color: string } | undefined;

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

function normalizeEvent(payload: z.infer<typeof eventSchema> & { userId: number }) {
  const startDate = cleanDate(payload.startDate);
  const endDate = payload.endDate ? cleanDate(payload.endDate) : null;

  if (endDate && sortKey(startDate, false) > sortKey(endDate, true)) {
    throw new Error('Das Ende darf nicht vor dem Anfang liegen.');
  }

  return {
    userId: payload.userId,
    title: payload.title,
    description: payload.description,
    category: normalizeCategories(payload.category),
    startDate: JSON.stringify(startDate),
    endDate: endDate ? JSON.stringify(endDate) : null,
    isOngoing: payload.isOngoing ? 1 : 0,
    sortStart: sortKey(startDate, false),
    sortEnd: sortKey(endDate ?? startDate, true),
  };
}

function normalizeCategories(value: string) {
  const unique = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
  return unique.join(', ') || 'Alltag';
}

function cleanDate(date: TimelineDate): TimelineDate {
  return {
    precision: date.precision,
    year: date.year,
    month: date.precision === 'year' ? null : date.month ?? null,
    day: date.precision === 'day' ? date.day ?? null : null,
  };
}

function sortKey(date: TimelineDate, end: boolean) {
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

function getEvents(db: Database.Database, userId: number) {
  const statement = db.prepare(`
    SELECT id, user_id as userId, title, description, category, start_date as startDate, end_date as endDate, is_ongoing as isOngoing, created_at as createdAt, updated_at as updatedAt, sort_start as sortStart, sort_end as sortEnd
    FROM events
    WHERE user_id = ?
    ORDER BY sort_start ASC, sort_end ASC, id ASC
  `);
  return (statement.all(userId) as Record<string, unknown>[]).map(deserializeEvent);
}

function getEventById(db: Database.Database, id: number, userId: number) {
  const row = db.prepare(`
    SELECT id, user_id as userId, title, description, category, start_date as startDate, end_date as endDate, is_ongoing as isOngoing, created_at as createdAt, updated_at as updatedAt, sort_start as sortStart, sort_end as sortEnd
    FROM events
    WHERE id = ? AND user_id = ?
  `).get(id, userId) as Record<string, unknown> | undefined;
  if (!row) throw new AuthError(404, 'Ereignis nicht gefunden.');
  return deserializeEvent(row);
}

function deserializeEvent(row: Record<string, unknown>) {
  return {
    ...row,
    startDate: JSON.parse(String(row.startDate)),
    endDate: row.endDate ? JSON.parse(String(row.endDate)) : null,
    isOngoing: Boolean(row.isOngoing),
  };
}

function getSummary(events: ReturnType<typeof getEvents>) {
  if (!events.length) {
    return {
      totalUsers: 1,
      totalEvents: 0,
      rangeLabel: 'Noch leer',
      ongoingEvents: 0,
    };
  }
  const first = events[0];
  const last = events[events.length - 1];
  return {
    totalUsers: 1,
    totalEvents: events.length,
    rangeLabel: `${first.startDate.year} – ${(last.endDate ?? last.startDate).year}`,
    ongoingEvents: events.filter((event) => event.isOngoing).length,
  };
}

function sanitizeUser(row: { id: number; name: string; color: string; email: string; role: Role; createdAt: string }) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
  } satisfies SanitizedUser;
}

function getUserRowByEmail(db: Database.Database, email: string) {
  return db.prepare(`SELECT id, name, color, email, password_hash as passwordHash, role, created_at as createdAt FROM users WHERE lower(email) = lower(?)`).get(email) as
    | ({ id: number; name: string; color: string; email: string; passwordHash: string | null; role: Role; createdAt: string })
    | undefined;
}

function getUserRowById(db: Database.Database, id: number) {
  return db.prepare(`SELECT id, name, color, email, password_hash as passwordHash, role, created_at as createdAt FROM users WHERE id = ?`).get(id) as
    | ({ id: number; name: string; color: string; email: string; passwordHash: string | null; role: Role; createdAt: string })
    | undefined;
}

function getUserById(db: Database.Database, id: number) {
  const row = db.prepare(`SELECT id, name, color, email, role, created_at as createdAt FROM users WHERE id = ?`).get(id) as
    | ({ id: number; name: string; color: string; email: string; role: Role; createdAt: string })
    | undefined;
  return row ? sanitizeUser(row) : null;
}

function createUser(db: Database.Database, payload: z.infer<typeof createUserSchema>) {
  const result = db.prepare(`
    INSERT INTO users (name, color, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(payload.name, payload.color, payload.email.toLowerCase(), hashPassword(payload.password), payload.role);
  return getUserById(db, Number(result.lastInsertRowid))!;
}

function listUsers(db: Database.Database) {
  return db.prepare(`SELECT id, name, color, email, role, created_at as createdAt FROM users ORDER BY created_at ASC, id ASC`).all().map((row) => sanitizeUser(row as SanitizedUser));
}

function deletePasswordResetTokensForUser(db: Database.Database, userId: number, keepTokenId?: number) {
  if (keepTokenId) {
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?').run(userId, keepTokenId);
    return;
  }
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
}

function activeUserCount(db: Database.Database) {
  return Number((db.prepare('SELECT COUNT(*) as count FROM users WHERE email IS NOT NULL').get() as { count: number }).count);
}

function adminCount(db: Database.Database) {
  return Number((db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count);
}

function ensureUniqueEmail(db: Database.Database, email: string) {
  const existing = getUserRowByEmail(db, email);
  if (existing) throw new AuthError(409, 'E-Mail ist bereits vergeben.');
}

function ensureEventOwner(db: Database.Database, eventId: number, userId: number) {
  const row = db.prepare('SELECT id FROM events WHERE id = ? AND user_id = ?').get(eventId, userId);
  if (!row) throw new AuthError(404, 'Ereignis nicht gefunden.');
}

function readCookie(cookieHeader: string | undefined, key: string) {
  if (!cookieHeader) return null;
  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${key}=`))
    ?.slice(key.length + 1) ?? null;
}

function attachAuthCookies(res: express.Response, user: SanitizedUser, jwtSecret: string, secureCookies: boolean) {
  const token = signAccessToken({ sub: String(user.id), role: user.role, type: 'access' }, jwtSecret);
  const csrfToken = createCsrfToken();
  const ttl = tokenTtlSeconds();
  res.setHeader('Set-Cookie', [
    serializeCookie(AUTH_COOKIE, token, { httpOnly: true, maxAge: ttl, sameSite: 'Lax', secure: secureCookies }),
    serializeCookie(CSRF_COOKIE, csrfToken, { httpOnly: false, maxAge: ttl, sameSite: 'Lax', secure: secureCookies }),
  ]);
}

function securityHeaders(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function createRateLimiter() {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  return (scope: string, limit: number) => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const key = [scope, req.ip, email].filter(Boolean).join(':');
    const now = Date.now();
    const current = attempts.get(key);

    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return next();
    }

    if (current.count >= limit) {
      return next(new AuthError(429, 'Zu viele Versuche. Bitte später erneut probieren.'));
    }

    current.count += 1;
    attempts.set(key, current);
    return next();
  };
}

function clearAuthCookies(res: express.Response, secureCookies: boolean) {
  res.setHeader('Set-Cookie', [
    serializeCookie(AUTH_COOKIE, '', { httpOnly: true, maxAge: 0, sameSite: 'Lax', secure: secureCookies }),
    serializeCookie(CSRF_COOKIE, '', { httpOnly: false, maxAge: 0, sameSite: 'Lax', secure: secureCookies }),
  ]);
}

function serializeCookie(name: string, value: string, options: { httpOnly: boolean; maxAge: number; sameSite: 'Lax'; secure: boolean }) {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${options.maxAge}`, `SameSite=${options.sameSite}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function readSetCookieValue(res: express.Response, cookieName: string) {
  const header = res.getHeader('Set-Cookie');
  const cookies = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  const found = cookies.find((entry) => entry.startsWith(`${cookieName}=`));
  return found?.split(';')[0]?.split('=')[1] ?? '';
}

function requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!req.auth) return next(new AuthError(401, 'Nicht angemeldet.'));
  return next();
}

function requireAdmin(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!req.auth) return next(new AuthError(401, 'Nicht angemeldet.'));
  if (req.auth.role !== 'admin') return next(new AuthError(403, 'Administratorrechte erforderlich.'));
  return next();
}

function requireCsrfForWrites(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.path.startsWith('/auth/') && !req.auth) return next(new AuthError(401, 'Nicht angemeldet.'));
  if (req.path === '/auth/login' || req.path === '/auth/register' || req.path === '/auth/logout') return next();

  const csrfCookie = readCookie(req.headers.cookie, CSRF_COOKIE);
  const csrfHeader = req.header('x-csrf-token');
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return next(new AuthError(403, 'CSRF-Token fehlt oder ist ungültig.'));
  }
  return next();
}

class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
