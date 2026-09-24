import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';

test('production entry starts and serves health, 404 and unauthorized responses', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '18763',
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
      JWT_HS256_SECRET: randomBytes(32).toString('hex'),
      PAYMENT_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
      SYSTEM_ACTOR_USER_ID: '00000000-0000-4000-8000-000000000001' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = ''; child.stderr.on('data', c => { stderr += c; });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on('data', c => { if (c.toString().includes('backend_started')) resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited ${code}: ${stderr}`)));
    });
    const base = 'http://127.0.0.1:18763';
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 503);
    assert.equal((await health.json()).error.code, 'DATABASE_UNAVAILABLE');
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/v1/not-a-route`)).status, 404);
    assert.equal((await fetch(`${base}/v1/orders/00000000-0000-4000-8000-000000000001`)).status, 401);
    assert.equal((await fetch(`${base}/health`)).status, 503);
    assert.equal(child.exitCode, null);
  } finally {
    const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit;
  }
});
