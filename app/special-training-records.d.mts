import type { CredentialVerificationResult } from "./credential/membership-verifier.mjs";
import type {
  CredentialVerifierOptions,
  SpecialTrainingCredentialVerificationResult,
  VerifiedSpecialTrainingPayload,
  VerifiedSpecialTrainingV2Payload
} from "./credential/special-training-verifier.mjs";

export interface SpecialTrainingRecord {
  eventId: string;
  credentialId: string;
  keyId: string;
  envelopeJson: string;
  registeredAt: string;
}
export type SpecialTrainingHistoryView = (VerifiedSpecialTrainingPayload | VerifiedSpecialTrainingV2Payload) & {
  eventId: string;
  credentialId: string;
  keyId: string;
  registeredAt: string;
  credentialVersion: 1 | 2;
  payload: VerifiedSpecialTrainingPayload | VerifiedSpecialTrainingV2Payload;
};
export interface SpecialTrainingAssessment { canConfirm: boolean; reason: string; }
export function specialTrainingPayloadEqual(left: unknown, right: unknown): boolean;
export function classifySpecialTrainingDuplicate(
  verification: SpecialTrainingCredentialVerificationResult,
  history: SpecialTrainingHistoryView[]
): string;
export function assessSpecialTrainingCredential(
  verification: SpecialTrainingCredentialVerificationResult,
  membershipVerification: CredentialVerificationResult | null,
  history: SpecialTrainingHistoryView[]
): SpecialTrainingAssessment;
export function createSpecialTrainingRecord(
  verification: SpecialTrainingCredentialVerificationResult,
  registeredAt: string
): SpecialTrainingRecord;
export function storedSpecialTrainingIdentity(record: SpecialTrainingRecord): {
  eventId: string;
  credentialId: string;
  payload: VerifiedSpecialTrainingPayload | VerifiedSpecialTrainingV2Payload;
};
export function validateStoredSpecialTrainingHistory(
  records: SpecialTrainingRecord[],
  verifierOptions?: CredentialVerifierOptions
): Promise<SpecialTrainingHistoryView[]>;
