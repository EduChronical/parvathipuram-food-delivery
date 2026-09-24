import pg from 'pg';
import { config } from './config.js';
import { mapDatabaseError } from './http/errors.js';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'parvathipuram-bites-phase2'
});

async function tx(role, appUserId, requestId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query(`SELECT set_config('app.user_id',$1,true), set_config('app.request_id',$2,true)`, [appUserId ?? '', requestId ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw mapDatabaseError(error);
  } finally {
    client.release();
  }
}

export function withActorTx(actorUserId, requestId, fn) {
  return tx('pb_authenticated', actorUserId, requestId, fn);
}

export function withSystemTx(actualActorUserId, requestId, fn) {
  const trace = actualActorUserId ? `${requestId ?? ''}|actor=${actualActorUserId}` : requestId;
  return tx('pb_authenticated', config.systemActorUserId, trace, fn);
}

export function withWorkerTx(requestId, fn) {
  return tx('pb_worker', '', requestId, fn);
}

export async function healthcheck() {
  const { rows } = await pool.query('SELECT now() AS now');
  return rows[0];
}
