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
      const known = status >= 500 ? configError(e) : null;
      // the message is shown only to a signed-in user; strip anything that looks like a connection string
      const detail = String(e?.message || '').replace(/postgres(ql)?:\/\/\S+/gi, '[DATABASE_URL]').slice(0, 160);
      send(res, status, { error: known || (status >= 500 && !e.expose ? `שגיאת שרת${e?.code ? ' (' + e.code + ')' : ''}: ${detail}` : e.message) });
    }
  };
}

export function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

/** Setup mistakes explained in plain words (never includes secret values). */
export function configError(e) {
  const msg = String(e?.message || '');
  const code = e?.code;
  const raw = process.env.DATABASE_URL || '';
  if (msg.includes('DATABASE_URL is not set')) return 'המשתנה DATABASE_URL לא מוגדר ב־Vercel. הוסף אותו ב־Settings → Environment Variables ועשה Redeploy.';
  if (msg.includes('MASTER_KEY')) return 'המשתנה MASTER_KEY חסר או לא תקין ב־Vercel. הוא צריך להיות מחרוזת באורך 44 תווים שמסתיימת ב־=.';
  if (/^["'\s]|["'\s]$/.test(raw)) return 'ב־DATABASE_URL יש מירכאות או רווח בהתחלה או בסוף. מחק אותם ועשה Redeploy.';
  if (raw && !/^postgres(ql)?:\/\//.test(raw)) return 'DATABASE_URL צריך להתחיל ב־postgresql://. העתק אותו שוב מ־Neon.';
  if (raw.includes('****')) return 'ב־DATABASE_URL מופיעות כוכביות במקום הסיסמה. ב־Neon לחץ Show credentials לפני ההעתקה.';
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'הסיסמה שבתוך DATABASE_URL שגויה. העתק את הכתובת שוב מ־Neon (אחרי Show credentials) ועשה Redeploy.';
  if (code === '3D000') return 'שם מסד הנתונים בסוף DATABASE_URL שגוי. העתק את הכתובת שוב מ־Neon.';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'כתובת השרת בתוך DATABASE_URL לא נמצאה. כנראה שחסר בה חלק. העתק אותה שוב מ־Neon.';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) return 'אין חיבור למסד הנתונים ב־Neon. בדוק שהפרויקט ב־Neon פעיל ונסה שוב.';
  if (e instanceof TypeError && /url/i.test(msg)) return 'DATABASE_URL לא בפורמט תקין. העתק אותו שוב מ־Neon, בלי מירכאות.';
  return null;
}
