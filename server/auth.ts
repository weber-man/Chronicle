import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const TOKEN_TTL_SECONDS = 60 * 60 * 12;

export interface AuthUserToken {
  sub: string;
  role: 'admin' | 'user';
  type: 'access';
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  }).toString('hex');

  return ['scrypt', SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION, salt, derived].join('$');
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, salt, expected] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !cost || !blockSize || !parallelization || !salt || !expected) return false;

  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  });
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (derived.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuffer);
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

export function tokenTtlSeconds() {
  return TOKEN_TTL_SECONDS;
}
