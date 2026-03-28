/**
 * Must be imported before any module that reads process.env (e.g. config.ts).
 * ESM hoists imports, but sibling imports run in source order; this file has no env-dependent exports.
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
