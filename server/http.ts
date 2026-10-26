import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type express from 'express';
import { createCsrfToken, signAccessToken, tokenTtlSeconds, verifyAccessToken } from './auth.js';
import { HttpError } from './errors.js';
import { getUserSession } from './users.js';
import type { SanitizedUser } from './types.js';

export const AUTH_COOKIE = 'lifeline_auth';
export const CSRF_COOKIE = 'lifeline_csrf';
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function createAuthMiddleware(db: Database.Database, jwtSecret: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const token = readCookie(req.headers.cookie, AUTH_COOKIE);
    if (!token) return next();
    try {
      const payload = verifyAccessToken(token, jwtSecret);
      if (payload.type !== 'access') return next();
      const session = getUserSession(db, Number(payload.sub));
      if (session && Number(payload.ver ?? 0) === session.sessionVersion) {
        req.auth = session.user;
      }
    } catch {
      req.auth = undefined;
    }
    return next();
  };
}

export function attachAuthCookies(
  res: express.Response,
  user: Pick<SanitizedUser, 'id' | 'role'> & { sessionVersion: number },
  jwtSecret: string,
  secureCookies: boolean,
) {
  const token = signToken(user, jwtSecret);
  const csrfToken = createCsrfToken();
  const ttl = tokenTtlSeconds();
  res.setHeader('Set-Cookie', [
    serializeCookie(AUTH_COOKIE, token, { httpOnly: true, maxAge: ttl, sameSite: 'Lax', secure: secureCookies }),
    serializeCookie(CSRF_COOKIE, csrfToken, { httpOnly: false, maxAge: ttl, sameSite: 'Lax', secure: secureCookies }),
  ]);
  return csrfToken;
}

export function clearAuthCookies(res: express.Response, secureCookies: boolean) {
  res.setHeader('Set-Cookie', [
    serializeCookie(AUTH_COOKIE, '', { httpOnly: true, maxAge: 0, sameSite: 'Lax', secure: secureCookies }),
    serializeCookie(CSRF_COOKIE, '', { httpOnly: false, maxAge: 0, sameSite: 'Lax', secure: secureCookies }),
  ]);
}

export function requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!req.auth) return next(new HttpError(401, 'Nicht angemeldet.'));
  return next();
}

export function requireAdmin(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!req.auth) return next(new HttpError(401, 'Nicht angemeldet.'));
  if (req.auth.role !== 'admin') return next(new HttpError(403, 'Administratorrechte erforderlich.'));
  return next();
}

export function requireCsrfForWrites(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.path.startsWith('/auth/') && !req.auth) return next(new HttpError(401, 'Nicht angemeldet.'));
  if (req.path === '/auth/login' || req.path === '/auth/register' || req.path === '/auth/logout') return next();

  const csrfCookie = readCookie(req.headers.cookie, CSRF_COOKIE);
  const csrfHeader = req.header('x-csrf-token');
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return next(new HttpError(403, 'CSRF-Token fehlt oder ist ungültig.'));
  }
  return next();
}

export function securityHeaders(secure: boolean) {
  return (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    if (secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

export function requestContext(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requestId = req.header('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

export function createRateLimiter() {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  let calls = 0;

  return (scope: string, limit: number) => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const actor = req.auth?.id ? `u${req.auth.id}` : email;
    const key = [scope, req.ip, actor].filter(Boolean).join(':');
    const now = Date.now();

    calls += 1;
    if (calls % 250 === 0) {
      for (const [entryKey, entry] of attempts) {
        if (entry.resetAt <= now) attempts.delete(entryKey);
      }
    }

    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return next();
    }

    if (current.count >= limit) {
      return next(new HttpError(429, 'Zu viele Versuche. Bitte später erneut probieren.'));
    }

    current.count += 1;
    attempts.set(key, current);
    return next();
  };
}

export function readOrCreateJwtSecret(filePath: string) {
  try {
    const existing = fs.readFileSync(filePath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // Generate below.
  }

  const secret = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, secret, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
  return secret;
}

export function readCookie(cookieHeader: string | undefined, key: string) {
  if (!cookieHeader) return null;
  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${key}=`))
    ?.slice(key.length + 1) ?? null;
}

export function readSetCookieValue(res: express.Response, cookieName: string) {
  const header = res.getHeader('Set-Cookie');
  const cookies = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  const found = cookies.find((entry) => entry.startsWith(`${cookieName}=`));
  return found?.split(';')[0]?.split('=')[1] ?? '';
}

export function requestMeta(req: express.Request, extra: Record<string, unknown> = {}) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.auth?.id ?? null,
    ...extra,
  };
}

export function logInfo(event: string, meta: Record<string, unknown> = {}) {
  console.info(`[lifeline] ${event}`, meta);
}

export function logWarn(event: string, meta: Record<string, unknown> = {}) {
  console.warn(`[lifeline] ${event}`, meta);
}

export function logError(event: string, meta: Record<string, unknown> = {}) {
  console.error(`[lifeline] ${event}`, meta);
}

export function parseTrustProxy(value: string | undefined): boolean | number | string | undefined {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function signToken(
  user: Pick<SanitizedUser, 'id' | 'role'> & { sessionVersion: number },
  jwtSecret: string,
) {
  return signAccessToken(
    { sub: String(user.id), role: user.role, type: 'access', ver: user.sessionVersion },
    jwtSecret,
  );
}

function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly: boolean; maxAge: number; sameSite: 'Lax'; secure: boolean },
) {
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${options.maxAge}`, `SameSite=${options.sameSite}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}
