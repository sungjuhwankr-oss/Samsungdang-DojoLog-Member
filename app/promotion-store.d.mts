import type { CredentialVerifierOptions } from "./credential/credential-verifier.mjs";
import type { PromotionCredentialVerificationResult } from "./credential/promotion-verifier.mjs";
import type { CredentialVerificationResult } from "./credential/membership-verifier.mjs";
import type { PromotionRecord } from "./member-data.mjs";
import type { PromotionAssessment } from "./promotion-records.mjs";

export const PROMOTION_CHANGED_EVENT: "samsungdang-promotion-changed";
export class PromotionRegistrationError extends Error { readonly code: string; }
export function listVerifiedPromotionHistory(factory?: IDBFactory, options?: { verifierOptions?: CredentialVerifierOptions }): Promise<PromotionRecord[]>;
export function previewPromotionCredentialToken(token: string, options?: {
  factory?: IDBFactory;
  verifierOptions?: CredentialVerifierOptions;
}): Promise<{
  verification: PromotionCredentialVerificationResult;
  membershipVerification: CredentialVerificationResult | null;
  assessment: PromotionAssessment | null;
}>;
export function registerPromotionCredentialToken(token: string, options?: {
  factory?: IDBFactory;
  verifierOptions?: CredentialVerifierOptions;
  now?: () => string;
}): Promise<{
  verification: PromotionCredentialVerificationResult;
  assessment: PromotionAssessment;
  record: PromotionRecord;
}>;
