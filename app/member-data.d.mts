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

export type CurrentRank = PromotionRecord & { source: "self" | "samsungdang"; eventType: "self-recorded" | "promoted" | "recognized-at-entry"; label: string };

export function createMemberProfile(input: MemberProfileInput): MemberProfile;
export function createPromotion(input: PromotionInput, order: number, id: string): PromotionRecord;
export function nextPromotionOrder(promotions: Array<{ order: number }>): number;
export function deriveCurrentRank(promotions: PromotionRecord[]): CurrentRank | null;
export function planSchemaUpgrade(existingStores: string[]): {
  preserve: string[];
  create: string[];
};
export function findCanonicalKata(
  catalog: { kata: Array<{ id: string; nameKo: string }> },
  id: string
): { id: string; nameKo: string } | null;
