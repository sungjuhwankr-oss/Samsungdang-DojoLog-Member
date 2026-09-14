export type MemberProfile = {
  id: "self";
  name: string | null;
  memberNo: string | null;
  joinDate: string | null;
};

export type MemberProfileInput = Omit<MemberProfile, "id">;

export type PromotionRecord = {
  id: string;
  rankType: "kyu" | "dan";
  rankValue: number;
  date: string | null;
  order: number;
};

export type PromotionInput = Pick<PromotionRecord, "rankType" | "rankValue" | "date">;

export type CurrentRank = PromotionRecord & { label: string };

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
