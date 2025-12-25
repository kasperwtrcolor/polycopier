import pg from "pg";

// Create a connection pool using the DATABASE_URL environment variable
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Execute a parameterized query against the database.  Returns a typed pg.QueryResult.
 */
export async function q<T = any>(text: string, params: any[] = []) {
  const res = await pool.query(text, params);
  return res as pg.QueryResult<T>;
}