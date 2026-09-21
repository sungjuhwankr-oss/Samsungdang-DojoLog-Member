export type TrustedKeyStatus = "active" | "verify-only" | "blocked";
export interface TrustedKeyEntry {
  keyId: string;
  publicKeySpkiBase64Url: string;
  status: TrustedKeyStatus;
}
export type TrustedKeyRegistry = Readonly<Record<string, TrustedKeyEntry>>;
export const TRUSTED_KEY_STATUS: {
  readonly ACTIVE: "active";
  readonly VERIFY_ONLY: "verify-only";
  readonly BLOCKED: "blocked";
};
export const PRODUCTION_TRUSTED_KEY_REGISTRY: TrustedKeyRegistry;
