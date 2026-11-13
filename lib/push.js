// Phone notifications (Web Push). Keys are created on first use and kept in the database,
// the private key encrypted with MASTER_KEY, so no extra setup is needed.
import { createRequire } from 'node:module';
import { db } from './db.js';
import { encrypt, decrypt } from './crypto.js';

const webpush = createRequire(import.meta.url)('web-push');

async function keys() {
  const p = await db();
  const { rows } = await p.query("SELECT value FROM settings WHERE key = 'vapid'");
  if (rows[0]) return { publicKey: rows[0].value.publicKey, privateKey: decrypt(rows[0].value.privateKey).k };
  const k = webpush.generateVAPIDKeys();
  await p.query("INSERT INTO settings (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING",
    [JSON.stringify({ publicKey: k.publicKey, privateKey: encrypt({ k: k.privateKey }) })]);
  return keys(); // re-read in case another request created them first
}

export async function publicKey() {
  return (await keys()).publicKey;
}

export async function saveSubscription(sub) {
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('bad subscription');
  const p = await db();
  await p.query('INSERT INTO push_subscriptions (endpoint, subscription) VALUES ($1, $2) ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription',
    [sub.endpoint, JSON.stringify(sub)]);
}

export async function removeSubscription(endpoint) {
  const p = await db();
  await p.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function countSubscriptions() {
  const p = await db();
  return Number((await p.query('SELECT count(*) FROM push_subscriptions')).rows[0].count);
}

/** Sends to every registered device. Returns how many got it. Never throws. */
export async function notify({ title, body, url = '/', tag, urgent = false }) {
  try {
    const p = await db();
    const { rows } = await p.query('SELECT endpoint, subscription FROM push_subscriptions');
    if (!rows.length) return 0;
    const k = await keys();
    const opts = { vapidDetails: { subject: 'https://example.com', publicKey: k.publicKey, privateKey: k.privateKey }, TTL: urgent ? 300 : 3600, urgency: urgent ? 'high' : 'normal' };
    const payload = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    await Promise.all(rows.map(async (r) => {
      try { await webpush.sendNotification(r.subscription, payload, opts); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await removeSubscription(r.endpoint); else console.error('push failed', e.statusCode || e.message); }
    }));
    return sent;
  } catch (e) {
    console.error('push error', e.message);
    return 0;
  }
}
