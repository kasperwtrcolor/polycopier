import { Pool, type QueryResultRow } from "pg";

/**
 * Postgres connection pool
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Typed query helper.
 * The generic must extend QueryResultRow for pg typings.
 */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = []
) {
  const res = await pool.query<T>(text, params);
  return res;
}
