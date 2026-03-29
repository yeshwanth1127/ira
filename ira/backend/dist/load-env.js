/**
 * Must be imported before any module that reads process.env (e.g. config.ts).
 * Tries several paths so INTERNAL_API_KEY and friends load whether you start
 * `node dist/index.js` from the backend folder, repo root, or another cwd.
 */
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const unique = (paths) => [...new Set(paths.filter(Boolean))];
/** .env next to compiled output (…/backend/.env when running from dist/) */
const besideBundle = path.resolve(__dirname, "..", ".env");
/** Typical when `npm run start` cwd is backend/ */
const cwdEnv = path.resolve(process.cwd(), ".env");
/** Monorepo: cwd is repo root, app lives in ira/ira/backend */
const nestedBackend = path.resolve(process.cwd(), "ira", "ira", "backend", ".env");
for (const envPath of unique([besideBundle, cwdEnv, nestedBackend])) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }
}
// Default: .env in current working directory (merges; does not override existing keys)
dotenv.config();
//# sourceMappingURL=load-env.js.map