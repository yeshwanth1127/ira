import type { Entitlements } from "./types.js";
export declare function normalizeLicenseKey(input: string): string;
/** Same as admin-api `hash_license_key`: SHA-256 of UTF-8 key, hex (for GHOST-* keys in shared DB). */
export declare function adminStyleLicenseKeyHashHex(plaintext: string): string;
export declare function licenseKeyHash(plaintext: string): string;
export declare function generateLicenseKey(): string;
export declare function getEntitlementsForLicense(licenseId: string): Promise<Entitlements>;
//# sourceMappingURL=license.d.ts.map