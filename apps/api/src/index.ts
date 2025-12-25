import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

/**
 * Set these in Render -> (API service) -> Environment:
 *
 * PM_TOP_TRADERS_URL=https://...           (returns top traders JSON)
 * PM_LIVE_TRADES_URL=https://...           (returns live trades JSON)
 * PM_TRADER_TRADES_URL_TEMPLATE=https://.../trader/{id}/trades?limit={limit}
 *
 * You can also use templates without limit placeholders; we'll append ?limit=
 */
const PM_TOP_TRADERS_URL = process.env.PM_TOP_TRADERS_URL || "";
const PM_LIVE_TRADES_URL = process.env.PM_LIVE_TRADES_URL || "";
const PM_TRADER_TRADES_URL_TEMPLATE = process.env.PM_TRADER_TRADES_URL_TEMPLATE || "";

type AnyJson = any;

function requireEnv(name: string, value: string) {
  if (!value) {
    const msg = `Missing env var: ${name}. Set it in Render Environment for the API service.`;
    const err = new Error(msg);
    // @ts-ignore
    err.statusCode = 501;
    throw err;
  }
}

function withLimit(url: string, limit: number) {
  // If url already has ?, add &limit= else ?limit=
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}limit=${encodeURIComponent(String(limit))}`;
}

function applyTemplate(template: string, vars: Record<string, string | number>) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

async function fetchJson(url: string): Promise<AnyJson> {
  const r = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "polycopier-api"
    }
  });

  const text = await r.text();
  let json: AnyJson = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!r.ok) {
    const err: any = new Error(`Upstream error ${r.status}`);
    err.statusCode = r.status;
    err.payload = json;
    throw err;
  }

  return json;
}

// Basic routes
app.get("/", (_req, res) => res.status(200).send("polycopier api ok"));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// “Render API route list” (you define these; Render doesn't auto-list)
app.get("/routes", (_req, res) => {
  res.json({
    ok: true,
    routes: [
      "GET /",
      "GET /health",
      "GET /routes",
      "GET /pm/top-traders",
      "GET /pm/live-trades?limit=50",
      "GET /pm/trader/:id/trades?limit=100"
    ]
  });
});

// ---- Polymarket proxy routes ----

// GET /pm/top-traders
app.get("/pm/top-traders", async (_req, res) => {
  try {
    requireEnv("PM_TOP_TRADERS_URL", PM_TOP_TRADERS_URL);
    const data = await fetchJson(PM_TOP_TRADERS_URL);
    return res.json(data);
  } catch (e: any) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ ok: false, error: e?.message || "failed", details: e?.payload });
  }
});

// GET /pm/live-trades?limit=50
app.get("/pm/live-trades", async (req, res) => {
  try {
    requireEnv("PM_LIVE_TRADES_URL", PM_LIVE_TRADES_URL);
    const limit = Number(req.query.limit || 50);
    const url = withLimit(PM_LIVE_TRADES_URL, Number.isFinite(limit) ? limit : 50);
    const data = await fetchJson(url);
    return res.json(data);
  } catch (e: any) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ ok: false, error: e?.message || "failed", details: e?.payload });
  }
});

// GET /pm/trader/:id/trades?limit=100
app.get("/pm/trader/:id/trades", async (req, res) => {
  try {
    requireEnv("PM_TRADER_TRADES_URL_TEMPLATE", PM_TRADER_TRADES_URL_TEMPLATE);

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing trader id" });

    const limit = Number(req.query.limit || 100);
    const lim = Number.isFinite(limit) ? limit : 100;

    // If template contains {id} and/or {limit}, fill them.
    // If no {limit}, we’ll append ?limit=
    let url = applyTemplate(PM_TRADER_TRADES_URL_TEMPLATE, { id, limit: lim });

    if (!PM_TRADER_TRADES_URL_TEMPLATE.includes("{limit}")) {
      url = withLimit(url, lim);
    }

    const data = await fetchJson(url);
    return res.json(data);
  } catch (e: any) {
    const status = e?.statusCode || 500;
    return res.status(status).json({ ok: false, error: e?.message || "failed", details: e?.payload });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
