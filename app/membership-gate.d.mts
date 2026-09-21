import type { CredentialVerificationResult } from "./credential/membership-verifier.mjs";

export type MembershipVerificationResult = CredentialVerificationResult | null | undefined;

export type SamsungdangFeature = "session-share-import" | "training-progress" | "membership-card";

export interface MembershipFeatureGate {
  hasValidMembershipCredential: boolean;
  enabledFeatures: readonly SamsungdangFeature[];
}

export const SAMSUNGDANG_FEATURE: {
  readonly SESSION_SHARE_IMPORT: "session-share-import";
  readonly TRAINING_PROGRESS: "training-progress";
  readonly MEMBERSHIP_CARD: "membership-card";
};

export function createMembershipFeatureGate(
  verification: MembershipVerificationResult
): MembershipFeatureGate;
export function allowsSamsungdangFeature(
  gate: MembershipFeatureGate,
  feature: SamsungdangFeature | string
): boolean;
export function getCurrentMembershipFeatureGate(): MembershipFeatureGate;
export function loadCurrentMembershipFeatureGate(): Promise<MembershipFeatureGate>;
