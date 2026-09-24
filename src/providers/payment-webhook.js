import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';

export function canonicalPaymentEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_PAYMENT_EVENT', 'Payment event must be a JSON object.');
  function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    throw new HttpError(400, 'INVALID_PAYMENT_EVENT', 'Payment event must contain only JSON values.');
  }
  return `pb-payment-v2\n${canonical(body)}`;
}

export function verifyPaymentWebhook(body, signatureHeader) {
  if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Payment webhook signature required.');
  const suppliedHex = signatureHeader.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(suppliedHex)) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Malformed payment webhook signature.');
  const expected = crypto.createHmac('sha256', config.paymentWebhookSecret).update(canonicalPaymentEvent(body)).digest();
  const supplied = Buffer.from(suppliedHex, 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid payment webhook signature.');
}
