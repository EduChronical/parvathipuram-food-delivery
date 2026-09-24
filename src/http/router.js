import crypto from 'node:crypto';
import { verifyBearerToken } from '../security/jwt.js';
import { HttpError } from './errors.js';
import { config } from '../config.js';

function compilePattern(pattern) {
  const names = [];
  const segments = pattern.split('/').filter(Boolean);
  const source = segments.map(segment => {
    if (segment.startsWith(':')) {
      names.push(segment.slice(1));
      return '([^/]+)';
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return { regex: new RegExp(`^/${source}/?$`), names };
}

async function readJson(req, limitBytes = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body exceeds 1 MiB.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text); }
  catch { throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.'); }
}

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, { auth = 'jwt', body = false } = {}, handler) {
    const compiled = compilePattern(pattern);
    this.routes.push({ method: method.toUpperCase(), pattern, ...compiled, auth, body, handler });
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = this.routes.find(r => r.method === req.method && r.regex.test(url.pathname));
    const requestId = req.headers['x-request-id']?.toString().slice(0, 200) || crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    res.setHeader('vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && !config.corsAllowedOrigins.includes(origin)) return this.send(res, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' }, requestId });
    if (origin) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-expose-headers', 'x-request-id');
    }
    if (req.method === 'OPTIONS') {
      const method = req.headers['access-control-request-method'];
      const matching = this.routes.filter(r => r.regex.test(url.pathname));
      const allowedHeaders = ['authorization', 'content-type', 'idempotency-key', 'x-request-id'];
      const requestedHeaders = (req.headers['access-control-request-headers'] ?? '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
      if (!origin || !matching.some(r => r.method === method) || requestedHeaders.some(h => !allowedHeaders.includes(h))) return this.send(res, 403, { error: { code: 'PREFLIGHT_NOT_ALLOWED', message: 'Preflight request is not allowed.' }, requestId });
      res.setHeader('access-control-allow-methods', [...new Set(matching.map(r => r.method))].join(', '));
      res.setHeader('access-control-allow-headers', allowedHeaders.join(', '));
      res.setHeader('access-control-max-age', '600');
      res.setHeader('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      res.statusCode = 204;
      return res.end();
    }
    if (!route) return this.send(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' }, requestId });

    try {
      const match = url.pathname.match(route.regex);
      let params;
      try { params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])])); }
      catch { throw new HttpError(400, 'INVALID_PATH', 'Route path is malformed.'); }
      const actor = route.auth === 'jwt' ? verifyBearerToken(req.headers.authorization) : null;
      const json = route.body ? await readJson(req) : undefined;
      const query = Object.fromEntries(url.searchParams.entries());
      const result = await route.handler({ req, res, actor, params, query, body: json, requestId });
      if (res.writableEnded) return;
      this.send(res, result?.statusCode ?? 200, result?.body ?? result ?? {});
    } catch (error) {
      const status = error?.statusCode ?? 500;
      const code = error?.code ?? 'INTERNAL_ERROR';
      const message = status >= 500 ? 'Internal server error.' : error.message;
      if (status >= 500) console.error(JSON.stringify({ level: 'error', requestId, error: error?.stack ?? String(error) }));
      this.send(res, status, { error: { code, message, details: error?.details }, requestId });
    }
  }

  send(res, status, payload) {
    const body = JSON.stringify(payload);
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-length', Buffer.byteLength(body));
    res.setHeader('cache-control', 'no-store');
    res.end(body);
  }
}
