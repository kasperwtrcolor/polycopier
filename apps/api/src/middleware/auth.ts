import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

// Extend Express Request to include authentication context
export type AuthedRequest = Request & { userId?: string; solanaPubkey?: string };

/**
 * Middleware that checks for a Bearer token in the Authorization header and
 * validates it.  If valid, attaches `userId` and `solanaPubkey` to the request
 * object.  Otherwise responds with 401.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "") as any;
    req.userId = payload.userId;
    req.solanaPubkey = payload.solanaPubkey;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}