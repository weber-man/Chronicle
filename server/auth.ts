import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 1 << 17;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MAX_MEM = 256 * 1024 * 1024;
const MAX_CONCURRENT_SCRYPT = 2;
const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const MIN_JWT_SECRET_BYTES = 48;
const JWT_PLACEHOLDER_PATTERN = /(change[-_ ]?me|change[-_ ]?this|example|placeholder|your[-_ ]?secret|test[-_ ]?secret|development[-_ ]?secret)/i;

let activeScryptOperations = 0;
const scryptQueue: Array<() => void> = [];

type ParsedPasswordHash = {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: string;
  expected: string;
};

export interface AuthUserToken {
  sub: string;
  role: 'admin' | 'user';
  type: 'access';
  /**
   * Incremented whenever credentials or permissions change. Tokens without a
   * version are treated as version 0 so existing sessions survive an upgrade.
   */
  ver?: number;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, scryptOptions()).toString('hex');

  return ['scrypt', SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION, salt, derived].join('$');
}

export async function hashPasswordAsync(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await deriveKey(password, salt, scryptOptions());
  return ['scrypt', SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION, salt, derived.toString('hex')].join('$');
}

export function verifyPassword(password: string, storedHash: string) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;

  const derived = crypto.scryptSync(password, parsed.salt, SCRYPT_KEYLEN, scryptOptions(
    parsed.cost,
    parsed.blockSize,
    parsed.parallelization,
  ));
  return safeEqual(derived, Buffer.from(parsed.expected, 'hex'));
}

export async function verifyPasswordAsync(password: string, storedHash: string) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;

  const derived = await deriveKey(password, parsed.salt, scryptOptions(
    parsed.cost,
    parsed.blockSize,
    parsed.parallelization,
  ));
  return safeEqual(derived, Buffer.from(parsed.expected, 'hex'));
}

export function needsRehash(storedHash: string) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return true;
  return parsed.cost < SCRYPT_COST
    || parsed.blockSize < SCRYPT_BLOCK_SIZE
    || parsed.parallelization < SCRYPT_PARALLELIZATION;
}

export function signAccessToken(payload: AuthUserToken, secret: string) {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string, secret: string) {
  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as AuthUserToken & jwt.JwtPayload;
}

export function createCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function signCsrfToken(rawToken: string, userId: number, sessionVersion: number, secret: string) {
  const signature = crypto.createHmac('sha256', secret)
    .update(`csrf:${userId}:${sessionVersion}:${rawToken}`)
    .digest('hex');
  return `${rawToken}.${signature}`;
}

export function verifyCsrfToken(token: string, userId: number, sessionVersion: number, secret: string) {
  const [rawToken, signature, ...rest] = token.split('.');
  if (!rawToken || !signature || rest.length) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`csrf:${userId}:${sessionVersion}:${rawToken}`)
    .digest('hex');
  return safeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

export function assertStrongJwtSecret(secret: string) {
  if (Buffer.byteLength(secret, 'utf8') < MIN_JWT_SECRET_BYTES) {
    throw new Error(`JWT_SECRET muss mindestens ${MIN_JWT_SECRET_BYTES} Byte lang sein. Erzeuge ihn z. B. mit "openssl rand -hex 48".`);
  }
  if (JWT_PLACEHOLDER_PATTERN.test(secret)) {
    throw new Error('JWT_SECRET ist ein Platzhalter und wird abgelehnt. Erzeuge einen zufälligen Wert mit "openssl rand -hex 48".');
  }
  if (new Set(secret).size < 10) {
    throw new Error('JWT_SECRET hat zu wenig Zeichenvielfalt. Erzeuge einen zufälligen Wert mit "openssl rand -hex 48".');
  }
}

export function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function tokenTtlSeconds() {
  return TOKEN_TTL_SECONDS;
}

function parsePasswordHash(storedHash: string): ParsedPasswordHash | null {
  const [algorithm, costRaw, blockSizeRaw, parallelizationRaw, salt, expected] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !costRaw || !blockSizeRaw || !parallelizationRaw || !salt || !expected) return null;

  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelizationRaw);
  if (!Number.isInteger(cost) || cost < 2 || cost > SCRYPT_COST) return null;
  if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > SCRYPT_BLOCK_SIZE) return null;
  if (!Number.isInteger(parallelization) || parallelization < 1 || parallelization > SCRYPT_PARALLELIZATION) return null;
  if (!/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(expected)) return null;

  return { cost, blockSize, parallelization, salt, expected };
}

function scryptOptions(cost = SCRYPT_COST, blockSize = SCRYPT_BLOCK_SIZE, parallelization = SCRYPT_PARALLELIZATION) {
  return {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: SCRYPT_MAX_MEM,
  };
}

async function deriveKey(password: string, salt: string, options: crypto.ScryptOptions) {
  await acquireScryptSlot();
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, SCRYPT_KEYLEN, options, (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      });
    });
  } finally {
    releaseScryptSlot();
  }
}

function acquireScryptSlot() {
  if (activeScryptOperations < MAX_CONCURRENT_SCRYPT) {
    activeScryptOperations += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    scryptQueue.push(resolve);
  });
}

function releaseScryptSlot() {
  const next = scryptQueue.shift();
  if (next) {
    // Transfer the active slot directly to the next waiter.
    next();
  } else {
    activeScryptOperations -= 1;
  }
}

function safeEqual(left: Buffer, right: Buffer) {
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
