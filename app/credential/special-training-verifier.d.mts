import type {
  CredentialVerificationResult as CommonCredentialVerificationResult,
  CredentialVerifierOptions,
  VerifiedSpecialTrainingPayload,
  VerifiedSpecialTrainingV2Payload
} from "./credential-verifier.mjs";

export type {
  CredentialReason,
  CredentialVerifierOptions,
  SpecialTrainingCategory,
  VerifiedSpecialTrainingPayload
} from "./credential-verifier.mjs";
export type { VerifiedSpecialTrainingV2Payload } from "./credential-verifier.mjs";
export type SpecialTrainingCredentialVerificationResult =
  CommonCredentialVerificationResult<VerifiedSpecialTrainingPayload | VerifiedSpecialTrainingV2Payload>;
export {
  CREDENTIAL_REASON,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";
export const SPECIAL_TRAINING_INFLATED_LIMIT: number;
export const SPECIAL_TRAINING_TOKEN_HARD_LIMIT: number;
export function decodeSpecialTrainingTransportToken(token: string): Promise<string>;
export function verifySpecialTrainingCredentialJson(
  envelopeJson: string,
  options?: CredentialVerifierOptions
): Promise<SpecialTrainingCredentialVerificationResult>;
export function verifySpecialTrainingCredentialToken(
  token: string,
  options?: CredentialVerifierOptions
): Promise<SpecialTrainingCredentialVerificationResult>;
