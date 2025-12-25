import { q } from "./db.js";

/**
 * Append a log entry for a user.  The worker uses this to record events at
 * various severity levels (info, warn, error, success).
 */
export async function log(
  userId: string,
  level: "info" | "warn" | "error" | "success",
  message: string,
  meta: any = {}
): Promise<void> {
  await q(
    "INSERT INTO bot_logs(user_id, level, message, meta) VALUES($1,$2,$3,$4::jsonb)",
    [userId, level, message, JSON.stringify(meta)]
  );
}