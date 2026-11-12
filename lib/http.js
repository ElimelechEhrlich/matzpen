// Small helpers for the Vercel functions in /api.
import { createHmac } from 'node:crypto';
import { safeEqual } from './crypto.js';

export function sessionToken() {
  if (!process.env.APP_PASSWORD || !process.env.MASTER_KEY) throw new Error('APP_PASSWORD and MASTER_KEY must be set');
  return createHmac('sha256', process.env.MASTER_KEY).update('session:' + process.env.APP_PASSWORD).digest('base64url');
}

export function isAuthorized(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  return !!tok && safeEqual(tok, sessionToken());
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Wraps a handler map { GET, POST, ... } with auth and error handling. */
export function route(handlers, { auth = true } = {}) {
  return async (req, res) => {
    try {
      const h = handlers[req.method];
      if (!h) return send(res, 405, { error: 'Method not allowed' });
      if (auth && !isAuthorized(req)) return send(res, 401, { error: 'נדרשת התחברות' });
      const url = new URL(req.url, 'http://x');
      const out = await h({ req, res, query: Object.fromEntries(url.searchParams), body: ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readJson(req) : {} });
      if (!res.writableEnded) send(res, 200, out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      send(res, status, { error: status >= 500 && !e.expose ? 'שגיאת שרת. בדוק את הלוגים ב־Vercel.' : e.message });
    }
  };
}

export function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}
