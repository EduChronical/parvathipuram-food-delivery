import { HttpError } from './errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function objectBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'INVALID_BODY', 'JSON object body required.');
  return value;
}
export function uuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new HttpError(400, 'INVALID_FIELD', `${field} must be a UUID.`);
  return value;
}
export function string(value, field, { min = 1, max = 1000, optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_FIELD', `${field} must be a string.`);
  const v = value.trim();
  if (v.length < min || v.length > max) throw new HttpError(400, 'INVALID_FIELD', `${field} length must be ${min}-${max}.`);
  return v;
}
export function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return undefined;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, 'INVALID_FIELD', `${field} must be an integer between ${min} and ${max}.`);
  return value;
}
export function number(value, field, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new HttpError(400, 'INVALID_FIELD', `${field} must be a number between ${min} and ${max}.`);
  return value;
}
export function bool(value, field) {
  if (typeof value !== 'boolean') throw new HttpError(400, 'INVALID_FIELD', `${field} must be boolean.`);
  return value;
}
export function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw new HttpError(400, 'INVALID_FIELD', `${field} must be one of: ${allowed.join(', ')}.`);
  return value;
}
