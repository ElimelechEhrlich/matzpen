// Reads and writes used by both the API and the sync job.
import { createHash } from 'node:crypto';
import { db } from './db.js';
import { encrypt } from './crypto.js';
import { getProvider } from './providers.js';

export async function listConnections() {
  const p = await db();
  const { rows } = await p.query(`
    SELECT c.id, c.provider, c.label, c.enabled, c.created_at, c.last_sync_at, c.last_status, c.last_error,
           COALESCE(json_agg(json_build_object('accountNumber', a.account_number, 'balance', a.balance, 'updatedAt', a.updated_at))
                    FILTER (WHERE a.account_number IS NOT NULL), '[]') AS accounts
    FROM connections c LEFT JOIN accounts a ON a.connection_id = c.id
    GROUP BY c.id ORDER BY c.id`);
  return rows.map((r) => ({ ...r, kind: getProvider(r.provider)?.kind, providerName: getProvider(r.provider)?.name || r.provider,
    accounts: r.accounts.map((a) => ({ ...a, balance: a.balance == null ? null : Number(a.balance) })) }));
}

export async function addConnection({ provider, label, credentials }) {
  const p = await db();
  const { rows } = await p.query('INSERT INTO connections (provider, label, credentials) VALUES ($1, $2, $3) RETURNING id',
    [provider, label, encrypt(credentials)]);
  return rows[0].id;
}

export async function updateConnection(id, { label, enabled, credentials }) {
  const p = await db();
  if (label != null) await p.query('UPDATE connections SET label = $2 WHERE id = $1', [id, label]);
  if (enabled != null) await p.query('UPDATE connections SET enabled = $2 WHERE id = $1', [id, !!enabled]);
  if (credentials) await p.query("UPDATE connections SET credentials = $2, last_status = NULL, last_error = NULL WHERE id = $1", [id, encrypt(credentials)]);
}

export async function deleteConnection(id) {
  const p = await db();
  await p.query('DELETE FROM connections WHERE id = $1', [id]);
}

/** All transactions in the normalized shape lib/analysis.js expects. */
export async function loadTransactions({ sinceDays = 200 } = {}) {
  const p = await db();
  const { rows } = await p.query(`
    SELECT t.*, c.provider FROM transactions t JOIN connections c ON c.id = t.connection_id
    WHERE t.date >= CURRENT_DATE - $1::int ORDER BY t.date DESC, t.id DESC`, [sinceDays]);
  return rows.map((r) => ({
    id: Number(r.id),
    source: `${r.connection_id}:${r.account_number}`,
    connectionId: r.connection_id,
    kind: getProvider(r.provider)?.kind || 'bank',
    provider: r.provider,
    accountNumber: r.account_number,
    identifier: r.identifier,
    date: isoDate(r.date),
    processedDate: r.processed_date ? isoDate(r.processed_date) : null,
    description: r.description,
    memo: r.memo,
    chargedAmount: Number(r.charged_amount),
    originalAmount: r.original_amount == null ? null : Number(r.original_amount),
    originalCurrency: r.original_currency,
    type: r.type,
    status: r.status,
    installments: r.installments,
    category: r.category,
  }));
}

const isoDate = (d) => (d instanceof Date ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : String(d).slice(0, 10));

export async function getDismissed() {
  const p = await db();
  const { rows } = await p.query('SELECT key FROM dismissals');
  return new Set(rows.map((r) => r.key));
}

export async function dismiss(key) {
  const p = await db();
  await p.query('INSERT INTO dismissals (key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
}

export async function getSettings() {
  const p = await db();
  const { rows } = await p.query('SELECT key, value FROM settings');
  return { lowBalanceThreshold: 0, forecastDays: 30, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export async function saveSettings(obj) {
  const p = await db();
  for (const [k, v] of Object.entries(obj)) {
    await p.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, JSON.stringify(v)]);
  }
}

/**
 * Stable key per scraped transaction. Two real identical charges on the same day must stay two rows
 * (that is exactly what duplicate detection looks for), so rows without a bank identifier get an
 * occurrence number within the scrape.
 */
export function dedupeKeys(accountNumber, txns) {
  const seen = new Map();
  return txns.map((t) => {
    const base = t.identifier != null && t.identifier !== ''
      ? `id:${t.identifier}|${String(t.date).slice(0, 10)}`
      : `h:${String(t.date).slice(0, 10)}|${t.chargedAmount}|${t.description}|${t.memo || ''}`;
    const k = `${accountNumber}|${base}`;
    const i = seen.get(k) || 0;
    seen.set(k, i + 1);
    return createHash('sha256').update(`${k}|${i}`).digest('hex').slice(0, 32);
  });
}

export async function saveScrapeResult(connectionId, accounts) {
  const p = await db();
  const client = await p.connect();
  let added = 0;
  try {
    await client.query('BEGIN');
    // pending rows change amount/identifier once they clear, so they are replaced on every sync
    await client.query("DELETE FROM transactions WHERE connection_id = $1 AND status = 'pending'", [connectionId]);
    for (const acc of accounts) {
      const num = String(acc.accountNumber ?? '');
      await client.query(`INSERT INTO accounts (connection_id, account_number, balance, updated_at) VALUES ($1, $2, $3, now())
        ON CONFLICT (connection_id, account_number) DO UPDATE SET balance = COALESCE(EXCLUDED.balance, accounts.balance), updated_at = now()`,
        [connectionId, num, acc.balance ?? null]);
      const txns = acc.txns || [];
      const keys = dedupeKeys(num, txns);
      for (let i = 0; i < txns.length; i++) {
        const t = txns[i];
        const r = await client.query(`INSERT INTO transactions
          (connection_id, account_number, dedupe_key, identifier, date, processed_date, description, memo,
           original_amount, original_currency, charged_amount, type, status, installments, category)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (connection_id, dedupe_key) DO UPDATE SET
            status = EXCLUDED.status, processed_date = EXCLUDED.processed_date, charged_amount = EXCLUDED.charged_amount
          RETURNING (xmax = 0) AS inserted`,
          [connectionId, num, keys[i], t.identifier == null ? null : String(t.identifier), t.date.slice(0, 10),
           t.processedDate ? t.processedDate.slice(0, 10) : null, t.description || '', t.memo || null,
           t.originalAmount ?? null, t.originalCurrency || null, t.chargedAmount ?? t.originalAmount ?? 0,
           t.type || null, t.status || null, t.installments ? JSON.stringify(t.installments) : null, t.category || null]);
        if (r.rows[0]?.inserted) added++;
      }
    }
    await client.query("UPDATE connections SET last_sync_at = now(), last_status = 'ok', last_error = NULL WHERE id = $1", [connectionId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return added;
}

export async function markSyncError(connectionId, message) {
  const p = await db();
  await p.query("UPDATE connections SET last_sync_at = now(), last_status = 'error', last_error = $2 WHERE id = $1", [connectionId, message]);
}
