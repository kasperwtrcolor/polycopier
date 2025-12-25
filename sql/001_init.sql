-- Initialize database schema for PolyCopier

-- Ensure pgcrypto is available for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solana_pubkey TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bot_config (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  multiplier NUMERIC NOT NULL DEFAULT 0.1,
  max_trade_usd NUMERIC NOT NULL DEFAULT 5,
  min_notional_usd NUMERIC NOT NULL DEFAULT 1,
  max_slippage_bps INT NOT NULL DEFAULT 150,
  copy_delay_ms INT NOT NULL DEFAULT 1500,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('info','warn','error','success')),
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS bot_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('YES','NO')),
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  price NUMERIC NOT NULL,
  requested_usd NUMERIC NOT NULL,
  requested_shares NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACCEPTED','FILLED','REJECTED','FAILED','SKIPPED')),
  reason TEXT,
  order_id TEXT,
  tx_hash TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, signal_id)
);

CREATE TABLE IF NOT EXISTS positions_snapshot (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL,
  shares NUMERIC NOT NULL,
  avg_entry NUMERIC NOT NULL,
  current_price NUMERIC NOT NULL,
  unrealized_pnl NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token_id)
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_logs_user_ts ON bot_logs(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_hist_user_ts ON bot_history(user_id, ts DESC);