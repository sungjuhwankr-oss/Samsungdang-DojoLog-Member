import type { CredentialVerifierOptions } from "./credential/credential-verifier.mjs";
import type {
  MemberOnboardingVerificationResult,
  VerifiedMemberOnboardingPayload
} from "./credential/onboarding-verifier.mjs";

export interface OnboardingReceiptRecord {
  onboardingId: string;
  revision: number;
  credentialId: string;
  memberId: string;
  payloadJson: string;
  envelopeJson: string;
  activeRankEntryId: string;
  baselineAppliedAt: string;
  registeredAt: string;
}

export interface OnboardingRankRecord {
  entryKey: string;
  onboardingId: string;
  revision: number;
  entryId: string;
  rankType: "kyu" | "dan";
  rankValue: number;
  rankDate: string | null;
  recognizedAt: string;
  baselineAsOf: string;
  credentialId: string;
  registeredAt: string;
}

export interface ProgressBaselineRecord {
  baselineId: string;
  kind: "current-rank-session" | "kata";
  subjectId: string;
  value: number | null;
  provenance: "instructor-provided" | "self-recorded";
  originCredentialId: string;
  baselineAsOf: string;
  updatedAt: string;
  revision: number;
}

export type BaselineValueState =
  | { state: "unset" }
  | { state: "unknown" }
  | { state: "known"; value: number };

export interface BaselineChangeHistoryRecord {
  changeId: string;
  baselineId: string;
  actor: "instructor" | "member";
  before: BaselineValueState;
  after: BaselineValueState;
  changedAt: string;
  sourceCredentialId: string;
}

export interface ActiveOnboardingState {
  receipt: OnboardingReceiptRecord;
  verification: MemberOnboardingVerificationResult & {
    valid: true;
    verifiedPayload: Readonly<VerifiedMemberOnboardingPayload>;
  };
  ranks: OnboardingRankRecord[];
  baselines: ProgressBaselineRecord[];
}

export type OnboardingAssessmentReason =
  | "invalid-credential" | "new" | "identity-conflict" | "repair"
  | "reissue-replay" | "revision-conflict" | "revision-downgrade"
  | "revision-skip" | "revision-fork" | "correction";

export interface OnboardingAssessment {
  canConfirm: boolean;
  reason: OnboardingAssessmentReason;
}

export interface OnboardingOptions {
  factory?: IDBFactory;
  verifierOptions?: CredentialVerifierOptions;
  now?: () => string;
}

export const ONBOARDING_CHANGED_EVENT: string;
export class OnboardingRegistrationError extends Error {
  code: string;
  constructor(code: string, message?: string);
}
export function loadActiveOnboardingState(
  factory?: IDBFactory,
  verifierOptions?: CredentialVerifierOptions
): Promise<ActiveOnboardingState | null>;
export function previewMemberOnboardingToken(token: string, options?: OnboardingOptions): Promise<{
  verification: MemberOnboardingVerificationResult;
  assessment: OnboardingAssessment | null;
  current: ActiveOnboardingState | null;
}>;
export function assessOnboarding(
  verification: MemberOnboardingVerificationResult,
  current: ActiveOnboardingState | null
): OnboardingAssessment;
export function registerMemberOnboardingToken(token: string, options?: OnboardingOptions): Promise<{
  verification: MemberOnboardingVerificationResult;
  assessment: OnboardingAssessment;
}>;
export function updateProgressBaseline(
  baselineId: string,
  value: number | null,
  options?: OnboardingOptions
): Promise<ProgressBaselineRecord>;
