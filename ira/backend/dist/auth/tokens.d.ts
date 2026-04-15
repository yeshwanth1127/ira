export type AccessTokenClaims = {
    sub: string;
    typ: "access";
};
export declare function signAccessToken(userId: string): string;
export declare function verifyAccessToken(token: string): AccessTokenClaims;
//# sourceMappingURL=tokens.d.ts.map