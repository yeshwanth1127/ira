import type { Request } from "express";

/** Set `DEBUG_IRA_INTERNAL=1` (or `DEBUG_IRA=1`) for extra request context on auth failures. */
export function internalApiKeyDebugEnabled(): boolean {
  const v = process.env.DEBUG_IRA_INTERNAL || process.env.DEBUG_IRA;
  return v === "1" || v?.toLowerCase() === "true";
}

export function readInternalApiKeyHeader(req: Request): string | undefined {
  const h = req.headers["x-internal-api-key"];
  if (typeof h === "string") return h.trim();
  if (Array.isArray(h) && h[0] !== undefined) return String(h[0]).trim();
  return undefined;
}

export function internalApiKeyMatches(req: Request, configured: string): boolean {
  const key = configured.trim();
  if (!key) return false;
  const header = readInternalApiKeyHeader(req);
  if (header === undefined) return false;
  return header === key;
}

/**
 * Logs why internal API key auth failed. Never prints the actual secret.
 */
export function logInternalApiKeyForbidden(routeLabel: string, req: Request, configured: string): void {
  const key = configured.trim();
  const header = readInternalApiKeyHeader(req);
  const rid = (req as Request & { requestId?: string }).requestId;

  const parts: string[] = [];
  if (!key) parts.push("INTERNAL_API_KEY is empty in IRA backend (.env)");
  if (header === undefined || header === "") parts.push("no x-internal-api-key header (or empty after trim)");
  else if (key && header !== key) {
    if (header.length !== key.length) {
      parts.push(`length mismatch: header=${header.length} chars, env=${key.length} chars`);
    } else {
      parts.push("header and env differ (same length) — values do not match");
    }
  }

  const line = `[ira] ${routeLabel} → 403 Forbidden: ${parts.join("; ") || "internal key check failed"}`;
  console.warn(rid ? `${line} [request_id=${rid}]` : line);

  if (internalApiKeyDebugEnabled()) {
    const orig = req.headers["x-internal-api-key"];
    const origLen =
      typeof orig === "string" ? orig.length : Array.isArray(orig) ? orig.join(",").length : 0;
    console.warn(
      `[ira-debug] ${req.method} ${req.originalUrl ?? req.url} content-type=${req.headers["content-type"] ?? "(none)"} ` +
        `x-internal-api-key raw bytes≈${origLen} trimmed header len=${header?.length ?? 0} env key len=${key.length}`,
    );
  }
}
