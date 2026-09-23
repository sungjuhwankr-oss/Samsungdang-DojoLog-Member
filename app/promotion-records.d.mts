import type { CredentialVerifierOptions, PromotionRank } from "./credential/credential-verifier.mjs";
import type { CredentialVerificationResult } from "./credential/membership-verifier.mjs";
import type { PromotionCredentialVerificationResult } from "./credential/promotion-verifier.mjs";
import type { PromotionRecord } from "./member-data.mjs";

export interface PromotionAssessment {
  canConfirm: boolean;
  reason: string;
  currentRank: PromotionRank | null;
  resultRank: PromotionRank | null;
}
export function normalizePromotionRecord(record: PromotionRecord): PromotionRecord;
export function isBasicPromotionRecord(record: unknown): boolean;
export function rankOrdinal(rank: PromotionRank | null): number;
export function rankFromOrdinal(ordinal: number): PromotionRank;
export function advanceOneRank(currentRank: PromotionRank | null): PromotionRank;
export function currentPromotionRecord(history: PromotionRecord[]): PromotionRecord | null;
export function rankLabel(rank: PromotionRank): string;
export function assessPromotionCredential(
  verification: PromotionCredentialVerificationResult,
  membershipVerification: CredentialVerificationResult | null,
  history: PromotionRecord[]
): PromotionAssessment;
export function createSamsungdangPromotionRecord(
  verification: PromotionCredentialVerificationResult,
  assessment: PromotionAssessment,
  order: number,
  registeredAt: string
): PromotionRecord;
export function validateStoredPromotionHistory(
  history: PromotionRecord[],
  membershipVerification?: CredentialVerificationResult | null,
  verifierOptions?: CredentialVerifierOptions
): Promise<PromotionRecord[]>;
