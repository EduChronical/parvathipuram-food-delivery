import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createApp } from './app.js';
import { pool } from './db.js';

const app = createApp();
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend/dist');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
async function serveFrontend(req, res) {
  if (!['GET', 'HEAD'].includes(req.method) || req.url?.startsWith('/v1/') || req.url?.startsWith('/health')) return false;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const candidate = path.resolve(frontendRoot, `.${pathname}`);
    if (!candidate.startsWith(`${frontendRoot}${path.sep}`) && candidate !== frontendRoot) return false;
    let filePath = candidate;
    let contents;
    try { contents = await fs.readFile(filePath); }
    catch {
      filePath = path.join(frontendRoot, 'index.html');
      contents = await fs.readFile(filePath);
    }
    res.statusCode = 200;
    res.setHeader('content-type', mimeTypes[path.extname(filePath)] ?? 'application/octet-stream');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.end(req.method === 'HEAD' ? undefined : contents);
    return true;
  } catch {
    // The API router handles requests when no production frontend bundle is present.
    return false;
  }
}
const server = http.createServer(async (req, res) => {
  if (!await serveFrontend(req, res)) await app.handle(req, res);
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1000;

server.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', message: 'backend_started', port: config.port, at: new Date().toISOString() }));
});

async function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', message: 'shutdown', signal }));
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
