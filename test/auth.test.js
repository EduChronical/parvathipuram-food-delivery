import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
process.env.DATABASE_URL ||= 'postgresql://unused:unused@127.0.0.1:1/unused';
process.env.JWT_HS256_SECRET ||= randomBytes(32).toString('hex');
process.env.PAYMENT_WEBHOOK_SECRET ||= randomBytes(32).toString('hex');
process.env.SYSTEM_ACTOR_USER_ID ||= '00000000-0000-4000-8000-000000000001';
const { hashPassword, verifyPassword } = await import('../src/security/password.js');
const { createAuthService, normalizePhone, issueToken } = await import('../src/services/auth.service.js');
const { verifyBearerToken } = await import('../src/security/jwt.js');
const { createAuthLimiter } = await import('../src/routes/auth.routes.js');
const id = '00000000-0000-4000-8000-000000000002';

test('password hashes are salted, resist wrong passwords and reject malformed hashes', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('correct horse battery', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  assert.equal(await verifyPassword('anything', 'scrypt$99999999$8$1$salt$key'), false);
  await assert.rejects(() => hashPassword('tiny'), { code: 'INVALID_PASSWORD' });
});
test('phone canonicalization and bounded expiring signed tokens', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
  assert.throws(() => normalizePhone('+12025550123'), { code: 'INVALID_PHONE' });
  const token = issueToken(id);
  assert.equal(verifyBearerToken(`Bearer ${token}`).userId, id);
  assert.throws(() => verifyBearerToken(`Bearer ${issueToken(id, 1)}`), { code: 'TOKEN_EXPIRED' });
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  assert.equal(payload.exp - payload.iat, 3600);
  assert.equal(payload.role, undefined);
});
test('registration rejects privilege fields and only returns public identity', async () => {
  let queries = 0;
  const service = createAuthService(async (sql, values) => {
    queries++;
    assert.match(sql, /register_customer/);
    assert.equal(values[1], '+919876543210');
    assert.match(values[2], /^scrypt\$/);
    return [{ id, full_name: 'Customer', role: 'customer' }];
  });
  await assert.rejects(() => service.register({ fullName: 'Customer', phone: '9876543210', password: 'long password', role: 'super_admin' }), { code: 'INVALID_FIELDS' });
  assert.equal(queries, 0);
  const result = await service.register({ fullName: 'Customer', phone: '9876543210', password: 'long password' });
  assert.deepEqual(result.user, { id, fullName: 'Customer', role: 'customer' });
  assert.equal(verifyBearerToken(`Bearer ${result.token}`).userId, id);
});
test('login verifies password and database status; me rejects missing or inactive accounts', async () => {
  const password_hash = await hashPassword('long password');
  let row = { id, full_name: 'Owner', role: 'restaurant_owner', status: 'active', password_hash, restaurant_id: id };
  const service = createAuthService(async () => row ? [row] : []);
  const result = await service.login({ phone: '9876543210', password: 'long password' });
  assert.equal(result.user.restaurantId, id);
  assert.equal(result.user.password_hash, undefined);
  await assert.rejects(() => service.login({ phone: '9876543210', password: 'wrong' }), { code: 'INVALID_CREDENTIALS' });
  row.status = 'suspended';
  await assert.rejects(() => service.login({ phone: '9876543210', password: 'long password' }), { code: 'INVALID_CREDENTIALS' });
  row = null;
  await assert.rejects(() => service.login({ phone: '9876543210', password: 'long password' }), { code: 'INVALID_CREDENTIALS' });
  await assert.rejects(() => service.me(id), { code: 'ACCOUNT_INACTIVE' });
});
test('rate limiting bounds keys without letting rotation evict protected accounts', () => {
  let time = 0;
  const limit = createAuthLimiter({ now: () => time, maxKeys: 2, limit: 2, windowMs: 100 });
  limit('a'); limit('a');
  assert.throws(() => limit('a'), { statusCode: 429 });
  limit('b');
  assert.throws(() => limit('c'), { statusCode: 429 });
  time = 101;
  assert.doesNotThrow(() => limit('c'));
});
