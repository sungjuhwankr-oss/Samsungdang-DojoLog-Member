import type { TrustedKeyRegistry } from "./trusted-key-registry.mjs";

export type CredentialReason =
  | "OK" | "MALFORMED" | "DUPLICATE_JSON_KEY" | "UNSUPPORTED_SCHEMA"
  | "UNSUPPORTED_VERSION" | "UNSUPPORTED_TYPE" | "INVALID_FIELD"
  | "INVALID_ENCODING" | "UNKNOWN_KEY_ID" | "BLOCKED_KEY_ID"
  | "INVALID_SIGNATURE" | "CANONICALIZATION_ERROR";

export interface VerifiedMembershipPayload {
  name: string;
  memberId: string;
  joinedAt: string;
}

export interface CredentialVerificationResult {
  valid: boolean;
  reason: CredentialReason;
  credentialType: string | null;
  keyId: string | null;
  credentialId: string | null;
  verifiedPayload: Readonly<VerifiedMembershipPayload> | null;
  envelopeJson?: string;
}

export interface CredentialVerifierOptions {
  registry?: TrustedKeyRegistry;
  crypto?: Crypto;
  canonicalize?: (value: unknown) => string;
}

export const CREDENTIAL_REASON: Readonly<Record<CredentialReason, CredentialReason>>;
export function decodeCredentialTransportToken(token: string): string;
export function encodeCredentialTransportJson(envelopeJson: string): string;
export function parseCredentialTokenFromSearch(search: string):
  | { valid: true; reason: "OK"; token: string }
  | CredentialVerificationResult;
export function calculateKeyIdFromSpki(spkiBytes: Uint8Array, options?: CredentialVerifierOptions): Promise<string>;
export function verifyMembershipCredentialJson(envelopeJson: string, options?: CredentialVerifierOptions): Promise<CredentialVerificationResult>;
export function verifyMembershipCredentialToken(token: string, options?: CredentialVerifierOptions): Promise<CredentialVerificationResult>;
