import { Pool, type QueryResultRow } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Ensure required tables exist.
 * This runs once on startup.
 */
export async function migrate() {
  await pool.query(`
    create table if not exists bot_config (
      user_id text primary key,
      enabled boolean not null default true,
      targets jsonb not null default '[]'::jsonb,
      multiplier numeric not null default 1,
      max_trade_usd numeric not null default 10,
      min_notional_usd numeric not null default 1,
      max_slippage_bps int not null default 50,
      copy_delay_ms int not null default 0
    );

    create table if not exists bot_logs (
      id serial primary key,
      user_id text,
      level text,
      message text,
      meta jsonb,
      created_at timestamptz default now()
    );
  `);
}

/**
 * Typed query helper
 */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = []
) {
  const res = await pool.query<T>(text, params);
  return res;
}
