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

// IMPORTANT: On Render, set DATABASE_URL in the API service env vars.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL env var");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Render Postgres typically needs SSL
});

app.get("/", (_req, res) => res.status(200).send("polycopier api ok"));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// Store config that your worker reads.
// Assumes table exists. If your columns differ, tell me the schema and I’ll adjust.
app.post("/config", async (req, res) => {
  try {
    const { botHandle, enabled, pollIntervalMs } = req.body ?? {};

    // Minimal validation
    if (typeof botHandle !== "string" || !botHandle.trim()) {
      return res.status(400).json({ error: "botHandle is required" });
    }

    const enabledBool = enabled === undefined ? true : Boolean(enabled);
    const poll = pollIntervalMs === undefined ? 30000 : Number(pollIntervalMs);

    // Upsert a single-row config keyed by bot_handle
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

    const result = await pool.query(q, [botHandle.toLowerCase(), enabledBool, poll]);
    return res.status(200).json({ ok: true, config: result.rows[0] });
  } catch (err: any) {
    console.error("POST /config error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});

app.get("/config/:botHandle", async (req, res) => {
  try {
    const botHandle = String(req.params.botHandle || "").toLowerCase();
    const result = await pool.query(
      `SELECT bot_handle, enabled, poll_interval_ms, updated_at
       FROM bot_config
       WHERE bot_handle = $1
       LIMIT 1;`,
      [botHandle]
    );
    return res.status(200).json({ ok: true, config: result.rows[0] ?? null });
  } catch (err: any) {
    console.error("GET /config/:botHandle error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
