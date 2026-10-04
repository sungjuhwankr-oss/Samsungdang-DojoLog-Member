import type { CredentialVerificationResult } from "./credential/membership-verifier.mjs";
import type { CredentialVerifierOptions, SpecialTrainingCredentialVerificationResult } from "./credential/special-training-verifier.mjs";
import type { SpecialTrainingAssessment, SpecialTrainingHistoryView, SpecialTrainingRecord } from "./special-training-records.mjs";

export const SPECIAL_TRAINING_CHANGED_EVENT: "samsungdang-special-training-changed";
export class SpecialTrainingRegistrationError extends Error { readonly code: string; }
export function listVerifiedSpecialTrainingHistory(
  factory?: IDBFactory,
  options?: { verifierOptions?: CredentialVerifierOptions }
): Promise<SpecialTrainingHistoryView[]>;
export function previewSpecialTrainingCredentialToken(token: string, options?: {
  factory?: IDBFactory;
  verifierOptions?: CredentialVerifierOptions;
}): Promise<{
  verification: SpecialTrainingCredentialVerificationResult;
  membershipVerification: CredentialVerificationResult | null;
  assessment: SpecialTrainingAssessment | null;
  participation: { eventId: string; selectedSessionIds: string[]; updatedAt: string; revision: number } | null;
}>;
export function registerSpecialTrainingCredentialToken(token: string, options?: {
  factory?: IDBFactory;
  verifierOptions?: CredentialVerifierOptions;
  now?: () => string;
  selectedSessionIds?: string[];
}): Promise<{
  verification: SpecialTrainingCredentialVerificationResult;
  assessment: SpecialTrainingAssessment;
  record: SpecialTrainingRecord;
  participation: { eventId: string; selectedSessionIds: string[]; updatedAt: string; revision: number } | null;
}>;
