import type {
  CredentialReason,
  CredentialVerificationResult,
  CredentialVerifierOptions
} from "./credential-verifier.mjs";

export interface OnboardingRankPayload {
  entryId: string;
  rankType: "kyu" | "dan";
  rankValue: number;
  rankDate: string | null;
}

export interface OnboardingKataBaselinePayload {
  kataId: string;
  count: number | null;
}

export interface VerifiedMemberOnboardingPayload {
  onboardingId: string;
  revision: number;
  supersedesCredentialId: string | null;
  recognizedAt: string;
  membership: { name: string; memberId: string; joinedAt: string };
  recognizedRanks: OnboardingRankPayload[];
  currentRankEntryId: string;
  baselineAsOf: string;
  currentRankSessionBaseline: number | null;
  kataBaselines: OnboardingKataBaselinePayload[];
}

export type MemberOnboardingVerificationResult =
  CredentialVerificationResult<VerifiedMemberOnboardingPayload>;

export type OnboardingSearchResult =
  | { valid: true; reason: "OK"; token: string }
  | {
      valid: false;
      reason: CredentialReason;
      credentialType: null;
      keyId: null;
      credentialId: null;
      verifiedPayload: null;
    };

export const ONBOARDING_INFLATED_LIMIT: number;
export const ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT: number;
export function parseOnboardingBundleFromSearch(search: string): OnboardingSearchResult;
export function decodeOnboardingTransportToken(token: string): Promise<string>;
export function verifyMemberOnboardingToken(
  token: string,
  options?: CredentialVerifierOptions
): Promise<MemberOnboardingVerificationResult>;
export function verifyMemberOnboardingJson(
  json: string,
  options?: CredentialVerifierOptions
): Promise<MemberOnboardingVerificationResult>;
