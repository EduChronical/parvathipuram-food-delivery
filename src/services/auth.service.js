import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError, mapDatabaseError } from '../http/errors.js';
import { hashPassword, validatePassword, verifyPassword } from '../security/password.js';

export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 32) throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid Indian mobile number.');
  let phone = value.replace(/[ ()-]/g, '');
  if (/^[6-9][0-9]{9}$/.test(phone)) phone = `+91${phone}`;
  if (!/^\+91[6-9][0-9]{9}$/.test(phone)) throw new HttpError(400, 'INVALID_PHONE', 'Enter a valid Indian mobile number.');
  return phone;
}
export function issueToken(userId, now = Math.floor(Date.now() / 1000)) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, iss: config.jwtIssuer, aud: config.jwtAudience, iat: now, exp: now + 3600 })}`;
  return `${data}.${createHmac('sha256', config.jwtSecret).update(data).digest('base64url')}`;
}
async function authQuery(sql, values) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE pb_auth_service');
    const result = await client.query(sql, values);
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw mapDatabaseError(error);
  } finally { client.release(); }
}
function profile(row) {
  return { id: row.id, fullName: row.full_name, role: row.role, ...(row.restaurant_id ? { restaurantId: row.restaurant_id } : {}) };
}
export function createAuthService(query = authQuery) {
  return {
    async register(body) {
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_BODY', 'JSON object required.');
      if (Object.keys(body).some(key => !['fullName', 'phone', 'password'].includes(key))) throw new HttpError(400, 'INVALID_FIELDS', 'Only fullName, phone and password are accepted.');
      if (typeof body.fullName !== 'string' || !body.fullName.trim() || body.fullName.trim().length > 120) throw new HttpError(400, 'INVALID_NAME', 'Enter a name of 1 to 120 characters.');
      const phone = normalizePhone(body.phone);
      validatePassword(body.password);
      const hash = await hashPassword(body.password);
      const rows = await query('SELECT * FROM pb_auth.register_customer($1,$2,$3)', [body.fullName.trim(), phone, hash]);
      const user = profile(rows[0]);
      return { token: issueToken(user.id), user };
    },
    async login(body) {
      const phone = normalizePhone(body?.phone);
      if (typeof body?.password !== 'string' || Buffer.byteLength(body.password) > 256) throw new HttpError(400, 'INVALID_PASSWORD', 'Password required.');
      const rows = await query('SELECT * FROM pb_auth.credentials_for_phone($1)', [phone]);
      const row = rows[0];
      const matches = await verifyPassword(body.password, row?.password_hash);
      if (!matches || row?.status !== 'active') throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect phone number or password.');
      const user = profile(row);
      return { token: issueToken(user.id), user };
    },
    async me(userId) {
      const rows = await query('SELECT * FROM pb_auth.active_profile($1)', [userId]);
      if (!rows[0]) throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Active account required.');
      return { user: profile(rows[0]) };
    }
  };
}
export const authService = createAuthService();
