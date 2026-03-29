import type { Request } from "express";
/** Set `DEBUG_IRA_INTERNAL=1` (or `DEBUG_IRA=1`) for extra request context on auth failures. */
export declare function internalApiKeyDebugEnabled(): boolean;
export declare function readInternalApiKeyHeader(req: Request): string | undefined;
export declare function internalApiKeyMatches(req: Request, configured: string): boolean;
/**
 * Logs why internal API key auth failed. Never prints the actual secret.
 */
export declare function logInternalApiKeyForbidden(routeLabel: string, req: Request, configured: string): void;
//# sourceMappingURL=internalApiKeyAuth.d.ts.map