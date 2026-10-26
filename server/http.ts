import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type express from 'express';
import {
  createCsrfToken,
  signAccessToken,
  signCsrfToken,
  tokenTtlSeconds,
  verifyAccessToken,
  verifyCsrfToken,
} from './auth.js';
import { HttpError } from './errors.js';
import { getUserSession } from './users.js';
import type { SanitizedUser } from './types.js';

export const AUTH_COOKIE = 'lifeline_auth';
export const CSRF_COOKIE = 'lifeline_csrf';
export const SECURE_AUTH_COOKIE = '__Host-lifeline_auth';
export const SECURE_CSRF_COOKIE = '__Host-lifeline_csrf';
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 50_000;

export function createAuthMiddleware(db: Database.Database, jwtSecret: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const tokens = [SECURE_AUTH_COOKIE, AUTH_COOKIE]
      .map((cookieName) => readCookie(req.headers.cookie, cookieName))
      .filter((token): token is string => Boolean(token));
    for (const token of tokens) {
      try {
        const payload = verifyAccessToken(token, jwtSecret);
        if (payload.type !== 'access') continue;
        const session = getUserSession(db, Number(payload.sub));
        if (session && Number(payload.ver ?? 0) === session.sessionVersion) {
          req.auth = session.user;
          req.authSessionVersion = session.sessionVersion;
          break;
        }
      } catch {
        // Try the next cookie name (legacy vs __Host-).
      }
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
  const csrfToken = signCsrfToken(createCsrfToken(), user.id, user.sessionVersion, jwtSecret);
  const ttl = tokenTtlSeconds();
  const authCookie = secureCookies ? SECURE_AUTH_COOKIE : AUTH_COOKIE;
  const csrfCookie = secureCookies ? SECURE_CSRF_COOKIE : CSRF_COOKIE;
  res.setHeader('Set-Cookie', [
    serializeCookie(authCookie, token, { httpOnly: true, maxAge: ttl, sameSite: 'Lax', secure: secureCookies }),
    serializeCookie(csrfCookie, csrfToken, { httpOnly: false, maxAge: ttl, sameSite: 'Lax', secure: secureCookies }),
  ]);
  return csrfToken;
}

export function clearAuthCookies(res: express.Response, secureCookies: boolean) {
  res.setHeader('Set-Cookie', [
    serializeCookie(AUTH_COOKIE, '', { httpOnly: true, maxAge: 0, sameSite: 'Lax', secure: secureCookies }),
    serializeCookie(CSRF_COOKIE, '', { httpOnly: false, maxAge: 0, sameSite: 'Lax', secure: secureCookies }),
    serializeCookie(SECURE_AUTH_COOKIE, '', { httpOnly: true, maxAge: 0, sameSite: 'Lax', secure: true }),
    serializeCookie(SECURE_CSRF_COOKIE, '', { httpOnly: false, maxAge: 0, sameSite: 'Lax', secure: true }),
  ]);
}

export function requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!req.auth) return next(new HttpError(401, 'Not signed in.', 'not_authenticated'));
  return next();
}

export function requireAdmin(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!req.auth) return next(new HttpError(401, 'Not signed in.', 'not_authenticated'));
  if (req.auth.role !== 'admin') return next(new HttpError(403, 'Administrator privileges required.', 'admin_required'));
  return next();
}

export function requireCsrfForWrites(jwtSecret: string, allowedOrigins: string[] = []) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (!req.auth) return next(new HttpError(401, 'Not signed in.', 'not_authenticated'));

    const origin = req.header('origin');
    if (origin && !isAllowedOrigin(origin, req, allowedOrigins)) {
      return next(new HttpError(403, 'CSRF origin is invalid.', 'csrf_origin'));
    }

    const csrfCookies = [SECURE_CSRF_COOKIE, CSRF_COOKIE]
      .map((cookieName) => readCookie(req.headers.cookie, cookieName))
      .filter((token): token is string => Boolean(token));
    const csrfHeader = req.header('x-csrf-token');
    if (!csrfHeader) {
      return next(new HttpError(403, 'CSRF token missing or invalid.', 'csrf_missing'));
    }
    for (const csrfCookie of csrfCookies) {
      if (
        timingSafeEqualString(csrfCookie, csrfHeader)
        && verifyCsrfToken(csrfCookie, req.auth.id, req.authSessionVersion ?? 0, jwtSecret)
      ) {
        return next();
      }
    }
    return next(new HttpError(403, 'CSRF token invalid or expired.', 'csrf_invalid'));
  };
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

  const prune = (now: number) => {
    for (const [entryKey, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(entryKey);
    }
  };

  return (scope: string, limit: number, ipLimit = limit) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const email = rawEmail.length > 0 && rawEmail.length <= 254 ? rawEmail : '';
    const keys: Array<{ key: string; limit: number }> = [
      { key: `${scope}:ip:${req.ip}`, limit: ipLimit },
    ];
    if (req.auth?.id) {
      keys.push({ key: `${scope}:user:${req.auth.id}`, limit });
    } else if (email) {
      keys.push({ key: `${scope}:email:${email}`, limit });
    }

    calls += 1;
    if (calls % 250 === 0) prune(now);
    if (attempts.size > MAX_RATE_LIMIT_ENTRIES) {
      prune(now);
      if (attempts.size > MAX_RATE_LIMIT_ENTRIES) {
        res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
        return next(new HttpError(429, 'Too many attempts. Please try again later.', 'rate_limited'));
      }
    }

    for (const entry of keys) {
      const current = attempts.get(entry.key);
      if (current && current.resetAt > now && current.count >= entry.limit) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
        return next(new HttpError(429, 'Too many attempts. Please try again later.', 'rate_limited'));
      }
    }

    for (const entry of keys) {
      const current = attempts.get(entry.key);
      if (!current || current.resetAt <= now) {
        attempts.set(entry.key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      } else {
        current.count += 1;
      }
    }
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

export function hashIdentifier(value: string) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 12);
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

function isAllowedOrigin(origin: string, req: express.Request, allowedOrigins: string[]) {
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function timingSafeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
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
