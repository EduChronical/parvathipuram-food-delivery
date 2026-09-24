import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/api/client.js';

test('authenticated JSON requests retain the checkout idempotency key', async t => {
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/v1/orders');
    assert.equal(options.headers.authorization, 'Bearer session-token');
    assert.equal(JSON.parse(options.body).idempotencyKey, 'same-attempt');
    return new Response(JSON.stringify({ order: { id: 'order-id' } }), { status: 201 });
  });
  assert.deepEqual(await api('/v1/orders', { method: 'POST', token: 'session-token', body: { idempotencyKey: 'same-attempt' } }), { order: { id: 'order-id' } });
});
test('API failures preserve authorization status and safe user message', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Access denied' } }), { status: 403 }));
  await assert.rejects(api('/v1/admin-dashboard/live'), error => error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN');
});
test('HTML deployment fallback cannot be mistaken for successful JSON', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>app shell</html>', { status: 200 }));
  await assert.rejects(api('/v1/auth/me'), error => error.code === 'INVALID_SERVER_RESPONSE');
});
