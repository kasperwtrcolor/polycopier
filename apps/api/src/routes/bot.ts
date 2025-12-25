import { Router } from "express";
import { z } from "zod";
import { q } from "../services/db.js";

const router = Router();

// Example schemas — keep yours if different, but fix the .rows usage.
const UpsertConfigSchema = z.object({
  bot_handle: z.string().min(1),
  x_bearer_token: z.string().min(1),
  scan_interval_ms: z.number().int().positive().optional()
});

// GET /bot/config  (or whatever your endpoint is)
router.get("/config", async (_req, res) => {
  try {
    const rows = await q<any>("select * from bot_config limit 1");
    return res.json({ ok: true, config: rows[0] || null });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Failed" });
  }
});

// POST /bot/config
router.post("/config", async (req, res) => {
  try {
    const body = UpsertConfigSchema.parse(req.body);

    // If you had multiple queries here that used .rows, same fix:
    // const rows = await q(...); use rows directly.

    // Example upsert (adjust columns to your table)
    const rows = await q<{ id: string }>(
      `
      insert into bot_config (bot_handle, x_bearer_token, scan_interval_ms)
      values ($1, $2, coalesce($3, 1800000))
      on conflict (bot_handle)
      do update set
        x_bearer_token = excluded.x_bearer_token,
        scan_interval_ms = excluded.scan_interval_ms
      returning id
      `,
      [body.bot_handle, body.x_bearer_token, body.scan_interval_ms ?? null]
    );

    return res.json({ ok: true, id: rows[0]?.id });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err?.message || "Bad request" });
  }
});

// Any other handlers in this file:
// Replace patterns like:
//   const result = await q(...); result.rows
// With:
//   const rows = await q(...); rows

export default router;
