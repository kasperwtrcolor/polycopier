import express from "express";
import cors from "cors";
import { Pool } from "pg";

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// POST /config
// body: { userId: string, targets: string[], enabled?: boolean, maxTradeUsd?: number }
app.post("/config", async (req, res) => {
  const { userId, targets, enabled = true, maxTradeUsd = 10 } = req.body || {};

  if (!userId || !Array.isArray(targets)) {
    return res.status(400).json({ error: "userId and targets[] required" });
  }

  await pool.query(
    `
    insert into bot_config (user_id, enabled, targets, max_trade_usd)
    values ($1, $2, $3::jsonb, $4)
    on conflict (user_id) do update set
      enabled = excluded.enabled,
      targets = excluded.targets,
      max_trade_usd = excluded.max_trade_usd
    `,
    [userId, enabled, JSON.stringify(targets), maxTradeUsd]
  );

  res.json({ ok: true });
});

export default app;
