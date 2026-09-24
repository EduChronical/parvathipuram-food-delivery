import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';

function decodePart(part) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(part) || Buffer.from(part, 'base64url').toString('base64url') !== part) throw new Error('Invalid encoding');
    const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid claims');
    return value;
  }
  catch { throw new HttpError(401, 'INVALID_TOKEN', 'Malformed bearer token.'); }
}

function audMatches(aud) {
  return typeof aud === 'string' ? aud === config.jwtAudience : Array.isArray(aud) && aud.includes(config.jwtAudience);
}

export function verifyBearerToken(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw new HttpError(401, 'AUTH_REQUIRED', 'Bearer token required.');
  const token = header.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'INVALID_TOKEN', 'Malformed bearer token.');
  const [h, p, s] = parts;
  const headerObj = decodePart(h);
  const payload = decodePart(p);
  if (headerObj.alg !== 'HS256' || headerObj.typ && headerObj.typ !== 'JWT') throw new HttpError(401, 'INVALID_TOKEN', 'Unsupported JWT algorithm.');
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(`${h}.${p}`).digest();
  let supplied;
  if (!/^[A-Za-z0-9_-]{43}$/.test(s) || Buffer.from(s, 'base64url').toString('base64url') !== s) throw new HttpError(401, 'INVALID_TOKEN', 'Malformed JWT signature.');
  try { supplied = Buffer.from(s, 'base64url'); } catch { throw new HttpError(401, 'INVALID_TOKEN', 'Malformed JWT signature.'); }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw new HttpError(401, 'INVALID_TOKEN', 'Invalid JWT signature.');
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || typeof payload.sub !== 'string') throw new HttpError(401, 'INVALID_TOKEN', 'JWT subject missing.');
  if (!Number.isFinite(payload.exp)) throw new HttpError(401, 'INVALID_TOKEN', 'JWT expiry is required and must be numeric.');
  if (payload.exp <= now) throw new HttpError(401, 'TOKEN_EXPIRED', 'Bearer token expired.');
  if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > now + 30)) throw new HttpError(401, 'TOKEN_NOT_ACTIVE', 'Bearer token not active.');
  if (payload.iss !== config.jwtIssuer) throw new HttpError(401, 'INVALID_TOKEN', 'Unexpected token issuer.');
  if (!audMatches(payload.aud)) throw new HttpError(401, 'INVALID_TOKEN', 'Unexpected token audience.');
  return { userId: payload.sub };
}
