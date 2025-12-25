import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

/**
 * Database
 */
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL env var");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Base routes
 */
app.get("/", (_req, res) => {
  res.status(200).send("polycopier api ok");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

/**
 * PolyCopier configuration
 * Stored in Postgres for the worker to read
 */
app.post("/config", async (req, res) => {
  try {
    const { botHandle, enabled, pollIntervalMs } = req.body ?? {};

    if (typeof botHandle !== "string" || !botHandle.trim()) {
      return res.status(400).json({ error: "botHandle is required" });
    }

    const enabledBool = enabled === undefined ? true : Boolean(enabled);
    const poll = pollIntervalMs === undefined ? 30000 : Number(pollIntervalMs);

    const q = `
      INSERT INTO bot_config (bot_handle, enabled, poll_interval_ms, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (bot_handle)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        poll_interval_ms = EXCLUDED.poll_interval_ms,
        updated_at = NOW()
      RETURNING bot_handle, enabled, poll_interval_ms, updated_at;
    `;

    const result = await pool.query(q, [
      botHandle.toLowerCase(),
      enabledBool,
      poll
    ]);

    return res.status(200).json({
      ok: true,
      config: result.rows[0]
    });
  } catch (err: any) {
    console.error("POST /config error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});

app.get("/config/:botHandle", async (req, res) => {
  try {
    const botHandle = String(req.params.botHandle || "").toLowerCase();

    const result = await pool.query(
      `
      SELECT bot_handle, enabled, poll_interval_ms, updated_at
      FROM bot_config
      WHERE bot_handle = $1
      LIMIT 1;
      `,
      [botHandle]
    );

    return res.status(200).json({
      ok: true,
      config: result.rows[0] ?? null
    });
  } catch (err: any) {
    console.error("GET /config/:botHandle error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});

/**
 * ============================
 * POLYMARKET SIGNAL ENDPOINTS
 * ============================
 */

/**
 * Top traders leaderboard (proxy)
 *
 * Query params:
 *   period = daily | weekly | monthly | all
 *   category = all | politics | tech | sports | crypto | finance | culture
 */
app.get("/pm/leaderboard", async (req, res) => {
  try {
    const period = String(req.query.period || "daily");
    const category = String(req.query.category || "all");

    const url =
      `https://693ee85255fb0d5e85311330-api.poof.new/api/leaderboard` +
      `?period=${period}&category=${category}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(502).json({ error: "Upstream leaderboard failed" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error("GET /pm/leaderboard error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Live trades (proxy)
 *
 * Query params:
 *   traders = comma-separated trader addresses
 *   limit   = number (default 50)
 */
app.get("/pm/trades", async (req, res) => {
  try {
    const traders = String(req.query.traders || "");
    const limit = Number(req.query.limit || 50);

    if (!traders) {
      return res.status(400).json({ error: "traders query param required" });
    }

    const encoded = encodeURIComponent(traders);
    const url =
      `https://693ee85255fb0d5e85311331-api.poof.new/api/trades` +
      `?traders=${encoded}&limit=${limit}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(502).json({ error: "Upstream trades failed" });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error("GET /pm/trades error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`PolyCopier API listening on :${PORT}`);
});
