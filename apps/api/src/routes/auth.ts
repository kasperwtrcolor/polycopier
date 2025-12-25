import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { q } from "../services/db.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const LoginSchema = z.object({
  apiKey: z.string().min(1)
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { apiKey } = LoginSchema.parse(req.body);

    // rows is already returned (array)
    const rows = await q<{ id: string }>(
      "select id from bot_config where api_key = $1 limit 1",
      [apiKey]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Invalid API key" });
    }

    const token = jwt.sign({ botConfigId: rows[0].id }, JWT_SECRET, {
      expiresIn: "30d"
    });

    return res.json({ ok: true, token });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err?.message || "Bad request" });
  }
});

// GET /auth/me
router.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const decoded = jwt.verify(token, JWT_SECRET) as { botConfigId: string };

    const rows = await q<{ id: string }>(
      "select id from bot_config where id = $1 limit 1",
      [decoded.botConfigId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    return res.json({ ok: true, botConfigId: rows[0].id });
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
});

export default router;
