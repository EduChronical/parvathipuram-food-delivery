import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from '../http/errors.js';

const scrypt = promisify(derive);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const dummy = `scrypt$32768$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password) > 256) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'Use a password of at least 10 characters and at most 256 bytes.');
  }
  return password;
}
export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, options);
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 256) return false;
  const valid = typeof encoded === 'string' && /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded);
  const parts = (valid ? encoded : dummy).split('$');
  const key = await scrypt(password, parts[4], 64, options);
  return timingSafeEqual(key, Buffer.from(parts[5], 'hex')) && valid;
}
