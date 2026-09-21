import type {
  CredentialVerificationResult,
  CredentialVerifierOptions
} from "./credential/membership-verifier.mjs";

export interface StoredMembershipRecord {
  id: "current";
  credentialId: string;
  keyId: string;
  envelopeJson: string;
  registeredAt: string;
}

export class MembershipRegistrationError extends Error {
  readonly code: "invalid-credential" | "replay" | "existing-membership";
}

export const MEMBERSHIP_RECORD_ID: "current";
export const MEMBERSHIP_CHANGED_EVENT: "samsungdang-membership-changed";
export function readStoredMembershipRecord(factory?: IDBFactory): Promise<StoredMembershipRecord | null>;
export function loadStoredMembershipVerification(
  factory?: IDBFactory,
  verifierOptions?: CredentialVerifierOptions
): Promise<CredentialVerificationResult | null>;
export function registerMembershipCredentialToken(token: string, options?: {
  factory?: IDBFactory;
  verifierOptions?: CredentialVerifierOptions;
  now?: () => string;
}): Promise<CredentialVerificationResult>;
