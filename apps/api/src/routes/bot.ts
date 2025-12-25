import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { q } from "../services/db.js";
import { encryptJson } from "../services/crypto.js";

// Router for bot configuration and control
export const botRouter = Router();
botRouter.use(requireAuth);

// Schema for polymarket credentials
const CredsSchema = z.object({
  key: z.string().min(1),
  secret: z.string().min(1),
  passphrase: z.string().min(1)
});

/**
 * Save or update encrypted Polymarket API credentials.
 */
botRouter.post("/credentials", async (req: AuthedRequest, res) => {
  const creds = CredsSchema.parse(req.body);
  const ciphertext = encryptJson(creds);

  await q(
    `INSERT INTO pm_credentials(user_id, ciphertext)
     VALUES($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext, rotated_at=now()`,
    [req.userId, ciphertext]
  );

  res.json({ ok: true });
});

/**
 * Update bot configuration (targets, sizing rules, risk parameters).
 */
botRouter.post("/config", async (req: AuthedRequest, res) => {
  const body = z
    .object({
      targets: z.array(z.string().min(6)).max(50),
      multiplier: z.number().min(0).max(1),
      maxTradeUsd: z.number().min(0.5).max(500),
      minNotionalUsd: z.number().min(0).max(50),
      maxSlippageBps: z.number().int().min(0).max(5000),
      copyDelayMs: z.number().int().min(0).max(60000)
    })
    .parse(req.body);

  await q(
    `UPDATE bot_config SET
      targets=$2::jsonb,
      multiplier=$3,
      max_trade_usd=$4,
      min_notional_usd=$5,
      max_slippage_bps=$6,
      copy_delay_ms=$7,
      updated_at=now()
     WHERE user_id=$1`,
    [
      req.userId,
      JSON.stringify(body.targets),
      body.multiplier,
      body.maxTradeUsd,
      body.minNotionalUsd,
      body.maxSlippageBps,
      body.copyDelayMs
    ]
  );

  res.json({ ok: true });
});

/**
 * Enable the bot for the authenticated user and log an info message.
 */
botRouter.post("/start", async (req: AuthedRequest, res) => {
  await q("UPDATE bot_config SET enabled=true, updated_at=now() WHERE user_id=$1", [req.userId]);
  await q("INSERT INTO bot_logs(user_id, level, message) VALUES($1,'info','Starting Engine...')", [req.userId]);
  res.json({ ok: true });
});

/**
 * Disable the bot for the authenticated user and log a warn message.
 */
botRouter.post("/stop", async (req: AuthedRequest, res) => {
  await q("UPDATE bot_config SET enabled=false, updated_at=now() WHERE user_id=$1", [req.userId]);
  await q("INSERT INTO bot_logs(user_id, level, message) VALUES($1,'warn','Engine Stopped.')", [req.userId]);
  res.json({ ok: true });
});

/**
 * Retrieve the current bot status and recent logs.
 */
botRouter.get("/status", async (req: AuthedRequest, res) => {
  const cfg = await q(
    `SELECT enabled, targets, multiplier, max_trade_usd, min_notional_usd, max_slippage_bps, copy_delay_ms
     FROM bot_config WHERE user_id=$1`,
    [req.userId]
  );

  const logs = await q(
    `SELECT id, to_char(ts, 'HH24:MI:SS') as time, level as type, message
     FROM bot_logs WHERE user_id=$1 ORDER BY id DESC LIMIT 50`,
    [req.userId]
  );

  res.json({
    isRunning: !!cfg.rows[0]?.enabled,
    config: cfg.rows[0] || null,
    logs: logs.rows
  });
});

/**
 * Paginate through the trade history for the authenticated user.
 */
botRouter.get("/history", async (req: AuthedRequest, res) => {
  const cursor = Number((req.query.cursor as string) || 0);
  const rows = await q(
    `SELECT id, signal_id, market_id, token_id, outcome, side, price, requested_usd, requested_shares,
            status, reason, order_id, tx_hash, ts
     FROM bot_history
     WHERE user_id=$1 AND id > $2
     ORDER BY id ASC
     LIMIT 200`,
    [req.userId, cursor]
  );
  res.json({ items: rows.rows, nextCursor: rows.rows.at(-1)?.id ?? cursor });
});

/**
 * Retrieve current positions snapshot for the authenticated user.
 */
botRouter.get("/positions", async (req: AuthedRequest, res) => {
  const rows = await q(
    `SELECT token_id, shares, avg_entry, current_price, unrealized_pnl, updated_at
     FROM positions_snapshot WHERE user_id=$1 ORDER BY updated_at DESC`,
    [req.userId]
  );
  res.json({ items: rows.rows });
});