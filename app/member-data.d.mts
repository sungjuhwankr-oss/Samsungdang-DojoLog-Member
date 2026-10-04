export type MemberProfile = {
  id: "self";
  name: string | null;
  memberNo: string | null;
  joinDate: string | null;
};

export type MemberProfileInput = Omit<MemberProfile, "id">;

export type LegacyPromotionRecord = {
  id: string;
  rankType: "kyu" | "dan";
  rankValue: number;
  date: string | null;
  order: number;
};

export type SelfPromotionRecord = LegacyPromotionRecord & {
  source: "self";
  eventType: "self-recorded";
};

export type SamsungdangPromotionRecord = LegacyPromotionRecord & {
  source: "samsungdang";
  eventType: "promoted" | "recognized-at-entry";
  credentialId: string;
  keyId: string;
  envelopeJson: string;
  registeredAt: string;
  recognizedAt?: string;
};

export type PromotionRecord = LegacyPromotionRecord | SelfPromotionRecord | SamsungdangPromotionRecord;

export type PromotionInput = Pick<PromotionRecord, "rankType" | "rankValue" | "date">;

export type CurrentRank = {
  id: string; rankType: "kyu" | "dan"; rankValue: number; date: string | null;
  source: "self" | "samsungdang" | "samsungdang-onboarding";
  eventType: "self-recorded" | "promoted" | "recognized-at-entry" | "recognized-onboarding";
  label: string;
  entryId?: string;
  rankDate?: string | null;
  attributionAnchorDate?: string | null;
  [key: string]: unknown;
};

export function createMemberProfile(input: MemberProfileInput): MemberProfile;
export function createPromotion(input: PromotionInput, order: number, id: string): PromotionRecord;
export function nextPromotionOrder(promotions: Array<{ order: number }>): number;
export function deriveCurrentRank(promotions: PromotionRecord[]): CurrentRank | null;
export function deriveCurrentRankWithOnboarding(
  promotions: PromotionRecord[],
  onboardingState?: import("./onboarding-store.mjs").ActiveOnboardingState | null
): CurrentRank | null;
export function deriveVerifiedRankAtDate(
  promotions: PromotionRecord[],
  onboardingState: import("./onboarding-store.mjs").ActiveOnboardingState | null,
  sessionDate: string
): CurrentRank | null;
export function planSchemaUpgrade(existingStores: string[]): {
  preserve: string[];
  create: string[];
};
export function findCanonicalKata(
  catalog: { kata: Array<{ id: string; nameKo: string }> },
  id: string
): { id: string; nameKo: string } | null;
