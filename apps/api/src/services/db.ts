import { Pool, type QueryResultRow } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Missing DATABASE_URL env var");

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Typed query helper.
 * Fixes TS2344 by constraining T to QueryResultRow.
 */
export async function q<T extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}
