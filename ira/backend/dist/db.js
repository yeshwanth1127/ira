import { Pool } from "pg";
let pool = null;
export function getPool() {
    if (pool)
        return pool;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is missing");
    }
    pool = new Pool({ connectionString });
    return pool;
}
export async function dbQuery(text, params) {
    const p = getPool();
    const res = await p.query(text, params);
    return res;
}
//# sourceMappingURL=db.js.map