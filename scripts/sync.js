// Pulls transactions from every enabled connection and saves them.
// Runs on GitHub Actions on a schedule (see .github/workflows/sync.yml) or locally: `npm run sync`.
// Optional: SYNC_CONNECTION_ID=3 to sync a single connection.
import { createRequire } from 'node:module';
import { db } from '../lib/db.js';
import { decrypt } from '../lib/crypto.js';
import { getProvider } from '../lib/providers.js';
import { saveScrapeResult, markSyncError } from '../lib/store.js';
import { requestOtp, waitForOtp, clearOtp, loadSessionState, saveSessionState } from '../lib/otp.js';
import { wrapLogin, restoreDeviceState } from '../lib/bank-login.js';

const { createScraper } = createRequire(import.meta.url)('israeli-bank-scrapers');

const FIRST_SYNC_MONTHS = 12;
const OVERLAP_DAYS = 10; // re-read recent days so late-posted charges are caught

const ERRORS = {
  INVALID_PASSWORD: 'פרטי ההתחברות שגויים',
  CHANGE_PASSWORD: 'האתר מבקש להחליף סיסמה. החלף אותה באתר ועדכן כאן',
  ACCOUNT_BLOCKED: 'החשבון חסום באתר',
  TIMEOUT: 'האתר לא הגיב בזמן. אם הגיע SMS, הקלד את הקוד באפליקציה בסנכרון הבא.',
  TWO_FACTOR_RETRIEVER_MISSING: 'נדרש קוד אימות (OTP)',
};

async function main() {
  const pool = await db();
  const only = process.env.SYNC_CONNECTION_ID;
  const { rows } = await pool.query(
    `SELECT id, provider, label, credentials, last_sync_at FROM connections WHERE enabled ${only ? 'AND id = $1' : ''} ORDER BY id`,
    only ? [Number(only)] : []);
  if (!rows.length) { console.log('No connections to sync.'); return; }

  let failed = 0;
  for (const c of rows) {
    const provider = getProvider(c.provider);
    const start = c.last_sync_at
      ? new Date(new Date(c.last_sync_at).getTime() - OVERLAP_DAYS * 86400000)
      : new Date(new Date().setMonth(new Date().getMonth() - FIRST_SYNC_MONTHS));
    console.log(`→ ${c.label} (${provider?.name || c.provider}) from ${start.toISOString().slice(0, 10)}`);
    try {
      const device = await loadSessionState(c.id);
      let deviceState = null;
      const scraper = createScraper({
        companyId: c.provider,
        startDate: start,
        combineInstallments: false,
        futureMonthsToScrape: provider?.kind === 'card' ? 1 : undefined,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=he-IL'],
        executablePath: process.env.CHROME_PATH || undefined,
        defaultTimeout: 60000,
        preparePage: async (page) => {
          await page.emulateTimezone('Asia/Jerusalem').catch(() => {});
          await restoreDeviceState(page, device).catch(() => {});
        },
      });
      wrapLogin(scraper, {
        onOtpNeeded: async () => { await requestOtp(c.id); return waitForOtp(c.id); },
        onDeviceState: (state) => { deviceState = state; },
      });
      const result = await scraper.scrape(decrypt(c.credentials)).finally(() => clearOtp(c.id).catch(() => {}));
      if (!result.success) {
        const own = /[\u0590-\u05FF]/.test(result.errorMessage || '') ? result.errorMessage : null; // our own Hebrew messages
        throw new Error(own || ERRORS[result.errorType] || `${result.errorType}: ${result.errorMessage || ''}`.trim());
      }
      if (deviceState) await saveSessionState(c.id, deviceState);
      const added = await saveScrapeResult(c.id, result.accounts || []);
      console.log(`  ✓ ${result.accounts?.length || 0} accounts, ${added} new transactions`);
    } catch (e) {
      failed++;
      const msg = String(e.message || e).slice(0, 500);
      console.error(`  ✗ ${msg}`);
      await markSyncError(c.id, msg);
    }
  }
  await pool.end();
  if (failed === rows.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
