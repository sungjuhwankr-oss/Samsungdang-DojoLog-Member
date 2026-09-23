import type {
  CredentialVerificationResult as CommonCredentialVerificationResult,
  CredentialVerifierOptions,
  VerifiedMembershipPayload
} from "./credential-verifier.mjs";

export type { CredentialReason, CredentialVerifierOptions, VerifiedMembershipPayload } from "./credential-verifier.mjs";
export type CredentialVerificationResult = CommonCredentialVerificationResult<VerifiedMembershipPayload>;
export {
  CREDENTIAL_REASON,
  calculateKeyIdFromSpki,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";
export function verifyMembershipCredentialJson(envelopeJson: string, options?: CredentialVerifierOptions): Promise<CredentialVerificationResult>;
export function verifyMembershipCredentialToken(token: string, options?: CredentialVerifierOptions): Promise<CredentialVerificationResult>;
