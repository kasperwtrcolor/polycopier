import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { botRouter } from "./routes/bot.js";
import { pool } from "./services/db.js";

// Create Express app
const app = express();
// Enable CORS; allow any origin if CORS_ORIGIN not set
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
// Parse JSON bodies
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", async (_req, res) => {
  // Make a simple DB query to verify connectivity
  await pool.query("SELECT 1");
  res.json({ ok: true });
});

// Mount routers
app.use("/auth", authRouter);
app.use("/bot", botRouter);

// Start listening
const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`API listening on :${port}`));