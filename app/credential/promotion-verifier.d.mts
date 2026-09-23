import type {
  CredentialVerificationResult as CommonCredentialVerificationResult,
  CredentialVerifierOptions,
  VerifiedPromotionPayload
} from "./credential-verifier.mjs";

export type { CredentialReason, CredentialVerifierOptions, PromotionRank, VerifiedPromotionPayload } from "./credential-verifier.mjs";
export type PromotionCredentialVerificationResult = CommonCredentialVerificationResult<VerifiedPromotionPayload>;
export {
  CREDENTIAL_REASON,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";
export function verifyPromotionCredentialJson(envelopeJson: string, options?: CredentialVerifierOptions): Promise<PromotionCredentialVerificationResult>;
export function verifyPromotionCredentialToken(token: string, options?: CredentialVerifierOptions): Promise<PromotionCredentialVerificationResult>;
