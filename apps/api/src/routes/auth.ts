import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { q } from "../services/db.js";

// Router for authentication endpoints
export const authRouter = Router();

/**
 * Login endpoint.  Accepts a JSON body with a `solanaPubkey` and returns a JWT.
 * If the user does not exist, a new record is created along with a default bot_config row.
 */
authRouter.post("/login", async (req, res) => {
  const body = z.object({ solanaPubkey: z.string().min(32) }).parse(req.body);

  // Look up user by Solana public key
  const existing = await q<{ id: string }>(
    "SELECT id FROM users WHERE solana_pubkey=$1",
    [body.solanaPubkey]
  );

  let userId = existing.rows[0]?.id;
  if (!userId) {
    // Create new user
    const created = await q<{ id: string }>(
      "INSERT INTO users(solana_pubkey) VALUES($1) RETURNING id",
      [body.solanaPubkey]
    );
    userId = created.rows[0].id;

    // Ensure a bot_config row exists for this user
    await q(
      "INSERT INTO bot_config(user_id) VALUES($1) ON CONFLICT (user_id) DO NOTHING",
      [userId]
    );
  }

  // Sign JWT.  Include the user's id and public key for downstream usage.
  const token = jwt.sign(
    { userId, solanaPubkey: body.solanaPubkey },
    process.env.JWT_SECRET || "",
    { expiresIn: "30d" }
  );

  res.json({ token });
});