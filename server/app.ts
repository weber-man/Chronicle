import cors from 'cors';
import Database from 'better-sqlite3';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  createAiModelCache,
  deleteAiSettings,
  generateAiDraft,
  getAiSettings,
  listAiModels,
  reviseAiDraft,
  saveAiSettings,
} from './ai.js';
import { createResetToken, hashPassword, hashResetToken, verifyPassword } from './auth.js';
import { HttpError } from './errors.js';
import {
  createEvent,
  emptyTrash,
  exportUserData,
  getEventById,
  getFacets,
  getInsights,
  getSummary,
  importEvents,
  listEvents,
  purgeEvent,
  restoreEvent,
  softDeleteEvent,
  updateEvent,
} from './events.js';
import {
  attachAuthCookies,
  clearAuthCookies,
  createAuthMiddleware,
  createRateLimiter,
  logError,
  logInfo,
  logWarn,
  parseTrustProxy,
  requestContext,
  requestMeta,
  requireAdmin,
  requireAuth,
  requireCsrfForWrites,
  securityHeaders,
  readOrCreateJwtSecret,
} from './http.js';
import { backupDatabase, getSchemaVersion, latestSchemaVersion, runMigrations } from './migrations.js';
import {
  adminUpdateUserSchema,
  aiGenerateSchema,
  aiReviseSchema,
  aiSettingsSchema,
  createUserSchema,
  deleteAccountSchema,
  eventInputSchema,
  eventQuerySchema,
  importPayloadSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  updateAccountSchema,
} from './schemas.js';
import {
  activeUserCount,
  adminCount,
  bootstrapAdmin,
  createUser,
  deleteUser,
  ensureUniqueEmail,
  getUserById,
  getUserRowByEmail,
  getUserRowById,
  getUserSession,
  listUsers,
  sanitizeUser,
  updateUserDetails,
} from './users.js';

export interface AppOptions {
  dbPath?: string;
  jwtSecret?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
  adminColor?: string;
  allowRegistration?: boolean;
  secureCookies?: boolean;
  corsOrigins?: string[];
  trustProxy?: boolean | number | string;
  backupDir?: string;
  logRequests?: boolean;
  openRouterBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

const APP_VERSION = process.env.APP_VERSION ?? '0.1.0';
const PASSWORD_RESET_TTL_MINUTES = 30;
const LOGIN_ATTEMPT_LIMIT = 8;
const RESET_ATTEMPT_LIMIT = 5;
const AI_REQUEST_LIMIT = 30;
const DUMMY_PASSWORD_HASH = hashPassword('chronicle-timing-equalizer');

export function createApp(options: AppOptions = {}) {
  const app = express();
  const dbPath = options.dbPath ?? process.env.DB_PATH ?? defaultDbPath();
  const clientDistPath = path.join(process.cwd(), 'dist');
  const clientIndexPath = path.join(clientDistPath, 'index.html');
  const dbDir = path.dirname(dbPath);
  const backupDir = options.backupDir ?? path.join(dbDir, 'backups');
  fs.mkdirSync(dbDir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const migration = runMigrations(db, { dbPath, backupDir, log: logInfo });
  const schemaVersion = getSchemaVersion(db);

  const envSecret = options.jwtSecret ?? process.env.JWT_SECRET;
  const configuredAdminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production' && activeUserCount(db) === 0 && !configuredAdminPassword) {
    db.close();
    throw new Error(
      'ADMIN_PASSWORD muss beim ersten Start in Production gesetzt sein. Der bekannte Standard-Admin wird dort nicht verwendet.',
    );
  }
  const jwtSecret = envSecret || readOrCreateJwtSecret(path.join(dbDir, '.jwt-secret'));
  const usingGeneratedSecret = !envSecret;
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === 'production';
  const allowRegistration = options.allowRegistration ?? process.env.ALLOW_REGISTRATION !== 'false';
  const exposeResetToken = process.env.NODE_ENV !== 'production' || process.env.PASSWORD_RESET_DEBUG === 'true';
  const corsOrigins = options.corsOrigins ?? parseList(process.env.CORS_ORIGINS);
  const trustProxy = options.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY);
  const logRequests = options.logRequests ?? process.env.LOG_REQUESTS === 'true';
  const openRouterBaseUrl = (options.openRouterBaseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const aiModelCache = createAiModelCache();
  const authLimiter = createRateLimiter();

  app.disable('x-powered-by');
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.use(cors({
    origin: corsOrigins.length ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token'],
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(express.json({ limit: '5mb' }));
  app.use(securityHeaders(secureCookies));
  app.use(requestContext);

  if (logRequests) {
    app.use((req, res, next) => {
      const started = process.hrtime.bigint();
      res.on('finish', () => {
        logInfo('http.request', {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - started) / 1e6,
          userId: req.auth?.id ?? null,
        });
      });
      next();
    });
  }

  logInfo('startup.database_ready', {
    dbPath,
    schemaVersion,
    latestSchemaVersion,
    migrationBackup: migration.backupPath,
    environment: process.env.NODE_ENV ?? 'development',
    allowRegistration,
    jwtSecretSource: usingGeneratedSecret ? 'persisted-local-file' : 'environment',
    frontendBundled: fs.existsSync(clientIndexPath),
  });

  bootstrapAdmin(db, {
    email: options.adminEmail ?? process.env.ADMIN_EMAIL,
    password: configuredAdminPassword,
    name: options.adminName ?? process.env.ADMIN_NAME,
    color: options.adminColor ?? process.env.ADMIN_COLOR,
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      status: 'ok',
      version: APP_VERSION,
      schemaVersion,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/api/health/ready', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ ok: true, status: 'ready', schemaVersion });
    } catch (error) {
      logError('health.readiness_failed', { message: error instanceof Error ? error.message : String(error) });
      res.status(503).json({ ok: false, status: 'unavailable' });
    }
  });

  app.get('/api/auth/config', (_req, res) => {
    res.json({ allowRegistration, version: APP_VERSION });
  });

  app.use(createAuthMiddleware(db, jwtSecret));

  app.post('/api/auth/register', authLimiter('register', LOGIN_ATTEMPT_LIMIT), (req, res) => {
    if (!allowRegistration) {
      logWarn('auth.register_blocked', requestMeta(req, { reason: 'registration_disabled' }));
      return res.status(403).json({ message: 'Registrierung ist deaktiviert.' });
    }
    const payload = registerSchema.parse(req.body);
    ensureUniqueEmail(db, payload.email);

    const role = activeUserCount(db) === 0 ? 'admin' : 'user';
    const created = createUser(db, { ...payload, role });
    const session = getUserSession(db, created.id)!;
    logInfo('auth.register_success', requestMeta(req, { userId: created.id, email: created.email, role: created.role }));
    const csrfToken = attachAuthCookies(res, { id: created.id, role: created.role, sessionVersion: session.sessionVersion }, jwtSecret, secureCookies);
    res.status(201).json({ user: created, csrfToken });
  });

  app.post('/api/auth/login', authLimiter('login', LOGIN_ATTEMPT_LIMIT), (req, res) => {
    const payload = loginSchema.parse(req.body);
    const row = getUserRowByEmail(db, payload.email);
    const hash = row?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const validPassword = verifyPassword(payload.password, hash) && Boolean(row?.passwordHash);
    if (!row || !validPassword) {
      logWarn('auth.login_failed', requestMeta(req, { email: payload.email, reason: 'invalid_credentials' }));
      return res.status(401).json({ message: 'E-Mail oder Passwort falsch.' });
    }

    const user = sanitizeUser(row);
    logInfo('auth.login_success', requestMeta(req, { userId: user.id, email: user.email, role: user.role }));
    const csrfToken = attachAuthCookies(
      res,
      { id: row.id, role: row.role, sessionVersion: Number(row.sessionVersion ?? 0) },
      jwtSecret,
      secureCookies,
    );
    res.json({ user, csrfToken });
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
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(row.id);
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
      SET password_hash = ?,
          session_version = session_version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashPassword(payload.password), tokenRow.userId);
    db.prepare('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(tokenRow.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND id != ?').run(tokenRow.userId, tokenRow.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ?').run(new Date().toISOString());
    logInfo('auth.password_reset_success', requestMeta(req, { userId: tokenRow.userId }));
    clearAuthCookies(res, secureCookies);
    return res.json({ ok: true, message: 'Passwort wurde zurückgesetzt. Bitte neu anmelden.' });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.auth });
  });

  app.use('/api', requireCsrfForWrites);

  app.get('/api/events', requireAuth, (req, res) => {
    const query = eventQuerySchema.parse(req.query);
    const result = listEvents(db, req.auth!.id, query);
    res.json({
      ...result,
      summary: getSummary(db, req.auth!.id, activeUserCount(db)),
      facets: getFacets(db, req.auth!.id),
    });
  });

  app.get('/api/events/trash', requireAuth, (req, res) => {
    const query = eventQuerySchema.parse({
      ...req.query,
      trash: 'true',
      sort: req.query.sort ?? 'deleted-desc',
    });
    const result = listEvents(db, req.auth!.id, query);
    res.json({
      ...result,
      summary: getSummary(db, req.auth!.id, activeUserCount(db)),
      facets: getFacets(db, req.auth!.id),
    });
  });

  app.get('/api/events/:id', requireAuth, (req, res) => {
    res.json(getEventById(db, parseId(req.params.id), req.auth!.id));
  });

  app.post('/api/events', requireAuth, (req, res) => {
    const payload = eventInputSchema.parse(req.body);
    const event = createEvent(db, req.auth!.id, payload);
    logInfo('events.created', requestMeta(req, { userId: req.auth!.id, eventId: event.id, title: event.title }));
    res.status(201).json(event);
  });

  app.put('/api/events/:id', requireAuth, (req, res) => {
    const eventId = parseId(req.params.id);
    const payload = eventInputSchema.parse(req.body);
    const event = updateEvent(db, eventId, req.auth!.id, payload);
    logInfo('events.updated', requestMeta(req, { userId: req.auth!.id, eventId, title: payload.title }));
    res.json(event);
  });

  app.delete('/api/events/:id', requireAuth, (req, res) => {
    const eventId = parseId(req.params.id);
    const permanent = req.query.permanent === 'true' || req.query.permanent === '1';
    if (permanent) {
      purgeEvent(db, eventId, req.auth!.id);
      logInfo('events.purged', requestMeta(req, { userId: req.auth!.id, eventId }));
      return res.json({ ok: true, mode: 'permanent' });
    }

    const result = softDeleteEvent(db, eventId, req.auth!.id);
    logInfo('events.trashed', requestMeta(req, { userId: req.auth!.id, eventId }));
    res.json({ ok: true, mode: 'trash', deletedAt: result.deletedAt });
  });

  app.post('/api/events/:id/restore', requireAuth, (req, res) => {
    const eventId = parseId(req.params.id);
    const event = restoreEvent(db, eventId, req.auth!.id);
    logInfo('events.restored', requestMeta(req, { userId: req.auth!.id, eventId }));
    res.json(event);
  });

  app.delete('/api/trash', requireAuth, (req, res) => {
    const removed = emptyTrash(db, req.auth!.id);
    logInfo('trash.emptied', requestMeta(req, { userId: req.auth!.id, removed }));
    res.json({ ok: true, removed });
  });

  app.get('/api/insights', requireAuth, (req, res) => {
    res.json(getInsights(db, req.auth!.id));
  });

  app.get('/api/ai/settings', requireAuth, (req, res) => {
    res.json(getAiSettings(db, req.auth!.id, jwtSecret));
  });

  app.put('/api/ai/settings', requireAuth, (req, res) => {
    const payload = aiSettingsSchema.parse(req.body);
    if (!payload.apiKey && !payload.model) {
      throw new HttpError(400, 'API-Key oder Modell fehlt.');
    }
    const settings = saveAiSettings(db, req.auth!.id, jwtSecret, payload);
    logInfo('ai.settings_updated', requestMeta(req, {
      userId: req.auth!.id,
      model: settings.model,
      configured: settings.configured,
      keyChanged: Boolean(payload.apiKey),
    }));
    res.json(settings);
  });

  app.delete('/api/ai/settings', requireAuth, (req, res) => {
    const result = deleteAiSettings(db, req.auth!.id);
    logInfo('ai.settings_removed', requestMeta(req, { userId: req.auth!.id }));
    res.json(result);
  });

  app.get('/api/ai/models', requireAuth, authLimiter('ai-models', AI_REQUEST_LIMIT), async (req, res) => {
    const result = await aiModelCache.load(() => listAiModels({
      db,
      userId: req.auth!.id,
      secret: jwtSecret,
      baseUrl: openRouterBaseUrl,
      fetchImpl,
    }));
    res.json(result);
  });

  app.post('/api/ai/draft', requireAuth, authLimiter('ai-draft', AI_REQUEST_LIMIT), async (req, res) => {
    const payload = aiGenerateSchema.parse(req.body);
    const categories = getFacets(db, req.auth!.id).categories.map((item) => item.name);
    const result = await generateAiDraft({
      db,
      userId: req.auth!.id,
      secret: jwtSecret,
      baseUrl: openRouterBaseUrl,
      fetchImpl,
      prompt: payload.prompt,
      categories,
    });
    logInfo('ai.draft_created', requestMeta(req, {
      userId: req.auth!.id,
      model: result.model,
      title: result.draft.title,
      startYear: result.draft.startDate.year,
    }));
    res.json(result);
  });

  app.post('/api/ai/revise', requireAuth, authLimiter('ai-revise', AI_REQUEST_LIMIT), async (req, res) => {
    const payload = aiReviseSchema.parse(req.body);
    const categories = getFacets(db, req.auth!.id).categories.map((item) => item.name);
    const result = await reviseAiDraft({
      db,
      userId: req.auth!.id,
      secret: jwtSecret,
      baseUrl: openRouterBaseUrl,
      fetchImpl,
      draft: payload.draft,
      instruction: payload.instruction,
      categories,
    });
    logInfo('ai.draft_revised', requestMeta(req, {
      userId: req.auth!.id,
      model: result.model,
      title: result.draft.title,
    }));
    res.json(result);
  });

  app.get('/api/export', requireAuth, (req, res) => {
    const includeTrash = req.query.includeTrash !== 'false';
    const data = exportUserData(db, req.auth!.id, includeTrash);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="chronicle-export-${stamp}.json"`);
    res.type('application/json').send(JSON.stringify(data, null, 2));
  });

  app.post('/api/import', requireAuth, (req, res) => {
    const payload = importPayloadSchema.parse(req.body);
    const result = importEvents(db, req.auth!.id, payload.events);
    logInfo('data.imported', requestMeta(req, { userId: req.auth!.id, ...result }));
    res.json({ ok: true, ...result });
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

    const passwordChanged = Boolean(payload.newPassword);
    updateUserDetails(db, req.auth!.id, {
      name: payload.name,
      color: payload.color,
      passwordHash: payload.newPassword ? hashPassword(payload.newPassword) : null,
      bumpSession: passwordChanged,
    });

    const updated = getUserById(db, req.auth!.id);
    if (!updated) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });

    if (passwordChanged) {
      const session = getUserSession(db, updated.id)!;
      const csrfToken = attachAuthCookies(
        res,
        { id: updated.id, role: updated.role, sessionVersion: session.sessionVersion },
        jwtSecret,
        secureCookies,
      );
      return res.json({ user: updated, csrfToken });
    }

    return res.json({ user: updated });
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

    deleteUser(db, req.auth!.id);
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
    const userId = parseId(req.params.id);
    const row = getUserRowById(db, userId);
    if (!row) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    if (row.role === 'admin' && payload.role === 'user' && adminCount(db) <= 1) {
      return res.status(400).json({ message: 'Der letzte Administrator darf nicht herabgestuft werden.' });
    }

    const roleChanged = Boolean(payload.role && payload.role !== row.role);
    const passwordChanged = Boolean(payload.password);
    updateUserDetails(db, userId, {
      name: payload.name,
      color: payload.color,
      role: payload.role,
      passwordHash: payload.password ? hashPassword(payload.password) : null,
      bumpSession: roleChanged || passwordChanged,
    });

    logInfo('admin.user_updated', requestMeta(req, { actorUserId: req.auth!.id, userId, roleChanged, passwordChanged }));
    const updated = getUserById(db, userId);

    if (userId === req.auth!.id && (roleChanged || passwordChanged)) {
      const session = getUserSession(db, userId)!;
      const csrfToken = attachAuthCookies(
        res,
        { id: userId, role: session.user.role, sessionVersion: session.sessionVersion },
        jwtSecret,
        secureCookies,
      );
      return res.json({ user: updated, csrfToken });
    }

    return res.json({ user: updated });
  });

  app.get('/api/admin/backup', requireAdmin, (_req, res) => {
    const target = backupDatabase(db, dbPath, backupDir, 'admin-download');
    if (!target) throw new HttpError(400, 'Backup ist für diese Datenbank nicht verfügbar.');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    logInfo('admin.backup_downloaded', requestMeta(_req, { target }));
    res.download(target, `chronicle-backup-${stamp}.sqlite`);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'API-Endpunkt nicht gefunden.' });
  });

  if (fs.existsSync(clientIndexPath)) {
    app.use(express.static(clientDistPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(clientIndexPath);
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ message: 'Nicht gefunden.' });
  });

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;

    if (error instanceof z.ZodError) {
      logWarn('request.validation_failed', requestMeta(req, { message: error.issues[0]?.message ?? 'Ungültige Eingabe.' }));
      return res.status(400).json({
        message: error.issues[0]?.message ?? 'Ungültige Eingabe.',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }

    if (error instanceof HttpError) {
      logWarn('request.failed', requestMeta(req, { status: error.status, message: error.message }));
      return res.status(error.status).json({ message: error.message, requestId: req.requestId });
    }

    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ message: 'Ungültiges JSON.', requestId: req.requestId });
    }

    const message = error instanceof Error ? error.message : 'Unbekannter Fehler.';
    logError('request.crashed', requestMeta(req, { message, stack: error instanceof Error ? error.stack : undefined }));
    return res.status(500).json({
      message: 'Interner Serverfehler. Bitte später erneut probieren.',
      requestId: req.requestId,
    });
  });

  return { app, db, schemaVersion };
}

function defaultDbPath() {
  return path.join(process.cwd(), 'data', 'lifeline.sqlite');
}

function parseId(value: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Ungültige ID.');
  return id;
}

function parseList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
