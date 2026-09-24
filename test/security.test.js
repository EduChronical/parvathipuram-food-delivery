import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';

Object.assign(process.env, {
  DATABASE_URL: 'postgresql://unused@localhost/unused',
  JWT_HS256_SECRET: 'test-only-jwt-secret',
  PAYMENT_WEBHOOK_SECRET: 'test-only-webhook-secret',
  SYSTEM_ACTOR_USER_ID: '00000000-0000-4000-8000-000000000001',
  CORS_ALLOWED_ORIGINS: 'https://ordering.example'
});
const { verifyBearerToken } = await import('../src/security/jwt.js');
const { canonicalPaymentEvent, verifyPaymentWebhook } = await import('../src/providers/payment-webhook.js');
const { validatePaymentEventForOrder } = await import('../src/services/payment.service.js');
const { HttpError } = await import('../src/http/errors.js');
const { Router } = await import('../src/http/router.js');
const claims = () => ({ sub: 'customer', iss: 'parvathipuram-bites', aud: 'parvathipuram-bites-api', exp: Math.floor(Date.now() / 1000) + 60 });
function token(payload, header = { alg: 'HS256', typ: 'JWT' }) {
  const input = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `Bearer ${input}.${crypto.createHmac('sha256', process.env.JWT_HS256_SECRET).update(input).digest('base64url')}`;
}
const is401 = error => error.statusCode === 401;
function sign(event) {
  return `sha256=${crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET).update(canonicalPaymentEvent(event)).digest('hex')}`;
}

test('JWT accepts a valid exp and rejects missing, invalid or expired exp', () => {
  assert.deepEqual(verifyBearerToken(token(claims())), { userId: 'customer' });
  for (const exp of [undefined, null, '9999999999', 0, Math.floor(Date.now() / 1000) - 1]) {
    assert.throws(() => verifyBearerToken(token({ ...claims(), exp })), is401);
  }
});

test('JWT malformed header, claims, signatures and issuer produce 401', () => {
  for (const value of [null, [], true, 'text', 12]) {
    assert.throws(() => verifyBearerToken(token(value)), is401);
    assert.throws(() => verifyBearerToken(token(claims(), value)), is401);
  }
  for (const header of [undefined, [], 'Bearer a.b.c', `${token(claims())}!`, token({ ...claims(), iss: 'other' }), token({ ...claims(), aud: 'other' }), token({ ...claims(), nbf: Math.floor(Date.now() / 1000) + 90 })]) {
    assert.throws(() => verifyBearerToken(header), is401);
  }
});

test('payment signature authenticates transfer references and metadata without delimiter collisions', () => {
  const event = { eventId: 'event', provider: 'gateway', providerReference: 'charge', orderId: 'order', kind: 'split_settled', amountPaise: 1200, restaurantAmountPaise: 1000, riderAmountPaise: 200, platformAmountPaise: 0, restaurantTransferReference: 'restaurant-transfer', riderTransferReference: 'rider-transfer', failureMessage: null };
  const signature = sign(event);
  assert.doesNotThrow(() => verifyPaymentWebhook(event, signature));
  assert.doesNotThrow(() => verifyPaymentWebhook(Object.fromEntries(Object.entries(event).reverse()), signature));
  for (const key of Object.keys(event)) {
    const edited = { ...event, [key]: typeof event[key] === 'number' ? event[key] + 1 : 'tampered' };
    assert.throws(() => verifyPaymentWebhook(edited, signature), is401);
  }
  assert.throws(() => verifyPaymentWebhook({ ...event, newField: 'extra' }, signature), is401);
  assert.notEqual(canonicalPaymentEvent({ eventId: 'a|b', provider: 'c' }), canonicalPaymentEvent({ eventId: 'a', provider: 'b|c' }));
  assert.notEqual(canonicalPaymentEvent({ value: 1 }), canonicalPaymentEvent({ value: '1' }));
  assert.notEqual(canonicalPaymentEvent({}), canonicalPaymentEvent({ value: null }));
});

test('payment events require an allowlisted provider and cannot mutate COD or regress payment state', () => {
  const order = { payment_method: 'upi', payment_status: 'pending' };
  const event = { provider: 'gateway', kind: 'paid' };
  assert.doesNotThrow(() => validatePaymentEventForOrder(event, order, ['gateway']));
  assert.throws(() => validatePaymentEventForOrder(event, order, []), error => error instanceof HttpError && error.statusCode === 403);
  assert.throws(() => validatePaymentEventForOrder(event, { payment_method: 'cod', payment_status: 'cod_due' }, ['gateway']), error => error instanceof HttpError && error.code === 'COD_PAYMENT_EVENT_NOT_ALLOWED');
  assert.throws(() => validatePaymentEventForOrder({ ...event, kind: 'failed' }, { ...order, payment_status: 'paid' }, ['gateway']), error => error instanceof HttpError && error.code === 'INVALID_PAYMENT_TRANSITION');
  assert.throws(() => validatePaymentEventForOrder({ ...event, kind: 'refunded' }, order, ['gateway']), error => error instanceof HttpError && error.code === 'INVALID_PAYMENT_TRANSITION');
});

test('HTTP preflight and CORS enforce explicit origin, method and header allowlists', async () => {
  const router = new Router();
  let invoked = 0;
  router.add('POST', '/protected', { body: true }, async () => { invoked++; return { ok: true }; });
  router.add('GET', '/public/:id', { auth: 'none' }, async () => ({ ok: true }));
  const server = http.createServer((req, res) => router.handle(req, res));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const preflight = await fetch(`${base}/protected`, { method: 'OPTIONS', headers: { Origin: 'https://ordering.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization, Content-Type' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://ordering.example');
    assert.equal(invoked, 0);
    for (const headers of [
      { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
      { Origin: 'https://ordering.example', 'Access-Control-Request-Method': 'DELETE' },
      { Origin: 'https://ordering.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Admin' }
    ]) assert.equal((await fetch(`${base}/protected`, { method: 'OPTIONS', headers })).status, 403);
    assert.equal((await fetch(`${base}/protected`, { method: 'POST', headers: { Origin: 'https://evil.example', Authorization: token(claims()) }, body: '{}' })).status, 403);
    const unauthorized = await fetch(`${base}/protected`, { method: 'POST', headers: { Origin: 'https://ordering.example', Authorization: token(null) } });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get('access-control-allow-origin'), 'https://ordering.example');
    assert.equal((await fetch(`${base}/protected`, { method: 'POST', headers: { Origin: 'https://ordering.example', Authorization: token(claims()) }, body: '{}' })).status, 200);
    assert.equal(invoked, 1);
    assert.equal((await fetch(`${base}/public/%ZZ`)).status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
