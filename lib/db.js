// Postgres access (Neon / Supabase free tier, or any Postgres). DATABASE_URL comes from the environment.
import pg from 'pg';

let pool;
let ready;

export function db() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  }
  if (!ready) ready = migrate(pool).catch((e) => { ready = null; throw e; });
  return ready.then(() => pool);
}

async function migrate(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS connections (
      id            SERIAL PRIMARY KEY,
      provider      TEXT NOT NULL,
      label         TEXT NOT NULL,
      credentials   TEXT NOT NULL,              -- encrypted, see lib/crypto.js
      enabled       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_sync_at  TIMESTAMPTZ,
      last_status   TEXT,                       -- ok | error
      last_error    TEXT
    );
    CREATE TABLE IF NOT EXISTS accounts (
      connection_id  INT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      account_number TEXT NOT NULL,
      balance        NUMERIC,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (connection_id, account_number)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id               BIGSERIAL PRIMARY KEY,
      connection_id    INT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      account_number   TEXT NOT NULL,
      dedupe_key       TEXT NOT NULL,
      identifier       TEXT,
      date             DATE NOT NULL,
      processed_date   DATE,
      description      TEXT NOT NULL,
      memo             TEXT,
      original_amount  NUMERIC,
      original_currency TEXT,
      charged_amount   NUMERIC NOT NULL,
      type             TEXT,
      status           TEXT,
      installments     JSONB,
      category         TEXT,
      first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (connection_id, dedupe_key)
    );
    CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);
    CREATE TABLE IF NOT EXISTS dismissals (
      key        TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS otp_status TEXT;          -- waiting | submitted | expired
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS otp_requested_at TIMESTAMPTZ;
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS otp_code TEXT;            -- encrypted, cleared right after use
    ALTER TABLE connections ADD COLUMN IF NOT EXISTS session_state TEXT;       -- encrypted persistent cookies, so the bank remembers this device
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint     TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
}
