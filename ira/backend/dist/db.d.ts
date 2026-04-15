import { Pool } from "pg";
import type { QueryResultRow } from "pg";
export declare function getPool(): Pool;
export declare function dbQuery<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<import("pg").QueryResult<T>>;
//# sourceMappingURL=db.d.ts.map