import crypto from "node:crypto";

/**
 * Derive the AES‑256‑GCM key from the CREDENTIALS_MASTER_KEY environment variable.  Accepts
 * either a 64‑character hexadecimal string or a base64 string representing 32 bytes.
 */
function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_MASTER_KEY || "";
  // Accept hex (64 chars) or base64
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const b = Buffer.from(raw, "base64");
  if (b.length !== 32) throw new Error("CREDENTIALS_MASTER_KEY must be 32 bytes (hex64 or base64)");
  return b;
}

/**
 * Encrypt a JavaScript object using AES‑256‑GCM.  Prepends IV and auth tag to the ciphertext.
 */
export function encryptJson(obj: unknown): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * Decrypt a base64 string produced by encryptJson back into a JavaScript object.
 */
export function decryptJson<T>(b64: string): T {
  const key = getKey();
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}