// One-time codes (SMS) for bank logins.
// The sync job marks a connection as waiting, the app sends the code, the sync job reads it once and clears it.
import { db } from './db.js';
import { encrypt, decrypt } from './crypto.js';

export const OTP_WAIT_MS = 4 * 60 * 1000;

export async function requestOtp(connectionId) {
  const p = await db();
  await p.query("UPDATE connections SET otp_status = 'waiting', otp_requested_at = now(), otp_code = NULL WHERE id = $1", [connectionId]);
}

export async function submitOtp(connectionId, code) {
  const p = await db();
  const { rowCount } = await p.query(
    "UPDATE connections SET otp_code = $2 WHERE id = $1 AND otp_status = 'waiting' AND otp_requested_at > now() - interval '4 minutes'",
    [connectionId, encrypt({ code })]);
  return rowCount > 0;
}

/** Waits for the code from the app. Returns it once and clears it, or null after the wait. */
export async function waitForOtp(connectionId, { timeoutMs = OTP_WAIT_MS, intervalMs = 3000 } = {}) {
  const p = await db();
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { rows } = await p.query('SELECT otp_code FROM connections WHERE id = $1', [connectionId]);
    if (rows[0]?.otp_code) {
      await p.query("UPDATE connections SET otp_code = NULL, otp_status = 'submitted' WHERE id = $1", [connectionId]);
      return decrypt(rows[0].otp_code).code;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  await p.query("UPDATE connections SET otp_status = 'expired', otp_code = NULL WHERE id = $1", [connectionId]);
  return null;
}

export async function clearOtp(connectionId) {
  const p = await db();
  await p.query('UPDATE connections SET otp_status = NULL, otp_code = NULL WHERE id = $1', [connectionId]);
}

export async function loadSessionState(connectionId) {
  const p = await db();
  const { rows } = await p.query('SELECT session_state FROM connections WHERE id = $1', [connectionId]);
  try { return rows[0]?.session_state ? decrypt(rows[0].session_state) : null; } catch { return null; }
}

export async function saveSessionState(connectionId, state) {
  const p = await db();
  await p.query('UPDATE connections SET session_state = $2 WHERE id = $1', [connectionId, encrypt(state)]);
}
