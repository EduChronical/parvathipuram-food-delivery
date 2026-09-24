import { HttpError } from '../http/errors.js';
import { authService, normalizePhone } from '../services/auth.service.js';

// Bounded per-process abuse protection. Socket identity is used; proxy headers are untrusted.
export function createAuthLimiter({ now = Date.now, maxKeys = 10000, windowMs = 900000, limit = 20 } = {}) {
  const entries = new Map();
  return key => {
    const time = now();
    for (const [oldKey, entry] of entries) if (entry.until <= time) entries.delete(oldKey);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maxKeys) throw new HttpError(429, 'RATE_LIMITED', 'Please try again later.');
      entry = { count: 0, until: time + windowMs }; entries.set(key, entry);
    }
    if (++entry.count > limit) throw new HttpError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please try again later.');
  };
}
export function registerAuthRoutes(router, service = authService) {
  const ipLimit = createAuthLimiter({ limit: 100 });
  const accountLimit = createAuthLimiter();
  let running = 0;
  const protect = handler => async ctx => {
    ipLimit(ctx.req.socket?.remoteAddress ?? 'unknown');
    accountLimit(normalizePhone(ctx.body?.phone));
    if (running >= 8) throw new HttpError(429, 'RATE_LIMITED', 'Please try again shortly.');
    running++;
    try { return await handler(ctx); } finally { running--; }
  };
  router.add('POST', '/v1/auth/register', { auth: 'none', body: true }, protect(async ({ body }) => ({ statusCode: 201, body: await service.register(body) })));
  router.add('POST', '/v1/auth/login', { auth: 'none', body: true }, protect(({ body }) => service.login(body)));
  router.add('GET', '/v1/auth/me', { auth: 'jwt' }, ({ actor }) => service.me(actor.userId));
}
