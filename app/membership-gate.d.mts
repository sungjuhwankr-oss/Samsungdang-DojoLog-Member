export type MembershipVerificationResult =
  | { status: "valid" }
  | { status: "absent" | "invalid" }
  | null
  | undefined;

export type SamsungdangFeature = "session-share-import" | "training-progress";

export interface MembershipFeatureGate {
  hasValidMembershipCredential: boolean;
  enabledFeatures: readonly SamsungdangFeature[];
}

export const SAMSUNGDANG_FEATURE: {
  readonly SESSION_SHARE_IMPORT: "session-share-import";
  readonly TRAINING_PROGRESS: "training-progress";
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
