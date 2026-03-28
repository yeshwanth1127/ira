import { Pool } from "pg";
import type { QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }
  pool = new Pool({ connectionString });
  return pool;
}

export async function dbQuery<T extends QueryResultRow = any>(text: string, params?: any[]) {
  const p = getPool();
  const res = await p.query<T>(text, params);
  return res;
}

