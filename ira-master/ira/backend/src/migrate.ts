import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbQuery, getPool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureMigrationsTable() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listSqlFiles(migrationsDir: string) {
  const entries = await fs.readdir(migrationsDir);
  return entries
    .filter((n) => /^\d+_.+\.sql$/.test(n))
    .sort((a, b) => a.localeCompare(b));
}

async function hasApplied(id: string) {
  const res = await dbQuery<{ id: string }>("SELECT id FROM app_migrations WHERE id=$1", [id]);
  return (res.rowCount ?? 0) > 0;
}

async function applyMigration(id: string, sql: string) {
  const p = getPool();
  await p.query("BEGIN");
  try {
    await p.query(sql);
    await p.query("INSERT INTO app_migrations(id) VALUES ($1)", [id]);
    await p.query("COMMIT");
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}

async function main() {
  const migrationsDir = path.join(__dirname, "../migrations");
  await ensureMigrationsTable();
  const files = await listSqlFiles(migrationsDir);
  for (const f of files) {
    if (await hasApplied(f)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, f), "utf8");
    // eslint-disable-next-line no-console
    console.log(`Applying migration ${f}...`);
    await applyMigration(f, sql);
  }
  // eslint-disable-next-line no-console
  console.log("Migrations complete.");
  await getPool().end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

