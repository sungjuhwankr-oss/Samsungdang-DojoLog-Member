import type { TrustedKeyRegistry } from "./trusted-key-registry.mjs";

export type CredentialReason =
  | "OK" | "MALFORMED" | "DUPLICATE_JSON_KEY" | "UNSUPPORTED_SCHEMA"
  | "UNSUPPORTED_VERSION" | "UNSUPPORTED_TYPE" | "INVALID_FIELD"
  | "INVALID_ENCODING" | "UNKNOWN_KEY_ID" | "BLOCKED_KEY_ID"
  | "INVALID_SIGNATURE" | "CANONICALIZATION_ERROR";
export interface VerifiedMembershipPayload { name: string; memberId: string; joinedAt: string; }
export type PromotionRank = { rankType: "kyu" | "dan"; rankValue: number };
export type VerifiedPromotionPayload =
  | { eventType: "promoted"; examDate: string; mode: "advance-one" }
  | { eventType: "promoted"; examDate: string; mode: "target"; targetRank: PromotionRank }
  | { eventType: "recognized-at-entry"; memberId: string; mode: "target"; rankDate: string | null; recognizedAt: string; targetRank: PromotionRank };
export interface CredentialVerificationResult<T = VerifiedMembershipPayload | VerifiedPromotionPayload> {
  valid: boolean;
  reason: CredentialReason;
  credentialType: string | null;
  keyId: string | null;
  credentialId: string | null;
  verifiedPayload: Readonly<T> | null;
  envelopeJson?: string;
}
export interface CredentialVerifierOptions {
  registry?: TrustedKeyRegistry;
  crypto?: Crypto;
  canonicalize?: (value: unknown) => string;
  expectedType?: "membership" | "promotion";
}
export const CREDENTIAL_REASON: Readonly<Record<CredentialReason, CredentialReason>>;
export function isCalendarDate(value: unknown): value is string;
export function decodeCredentialTransportToken(token: string): string;
export function encodeCredentialTransportJson(envelopeJson: string): string;
export function parseCredentialTokenFromSearch(search: string): { valid: true; reason: "OK"; token: string } | CredentialVerificationResult;
export function calculateKeyIdFromSpki(spkiBytes: Uint8Array, options?: CredentialVerifierOptions): Promise<string>;
export function verifyCredentialJson(envelopeJson: string, options?: CredentialVerifierOptions): Promise<CredentialVerificationResult>;
export function verifyCredentialToken(token: string, options?: CredentialVerifierOptions): Promise<CredentialVerificationResult>;
