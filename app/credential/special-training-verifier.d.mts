import type {
  CredentialVerificationResult as CommonCredentialVerificationResult,
  CredentialVerifierOptions,
  VerifiedSpecialTrainingPayload
} from "./credential-verifier.mjs";

export type {
  CredentialReason,
  CredentialVerifierOptions,
  SpecialTrainingCategory,
  VerifiedSpecialTrainingPayload
} from "./credential-verifier.mjs";
export type SpecialTrainingCredentialVerificationResult =
  CommonCredentialVerificationResult<VerifiedSpecialTrainingPayload>;
export {
  CREDENTIAL_REASON,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";
export function verifySpecialTrainingCredentialJson(
  envelopeJson: string,
  options?: CredentialVerifierOptions
): Promise<SpecialTrainingCredentialVerificationResult>;
export function verifySpecialTrainingCredentialToken(
  token: string,
  options?: CredentialVerifierOptions
): Promise<SpecialTrainingCredentialVerificationResult>;
