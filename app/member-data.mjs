const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function optionalDate(value) {
  const normalized = optionalText(value);
  if (normalized === null) return null;
  if (!ISO_DATE.test(normalized)) throw new Error("date must use YYYY-MM-DD");
  const date = new Date(normalized + "T00:00:00Z");
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new Error("date must be valid");
  }
  return normalized;
}

export function createMemberProfile(input) {
  return {
    id: "self",
    name: optionalText(input.name),
    memberNo: optionalText(input.memberNo),
    joinDate: optionalDate(input.joinDate)
  };
}

export function createPromotion(input, order, id) {
  if (input.rankType !== "kyu" && input.rankType !== "dan") {
    throw new Error("rankType must be kyu or dan");
  }
  if (!Number.isInteger(input.rankValue) || input.rankValue <= 0) {
    throw new Error("rankValue must be a positive integer");
  }
  if (!Number.isInteger(order) || order <= 0) {
    throw new Error("order must be a positive integer");
  }
  return {
    id,
    rankType: input.rankType,
    rankValue: input.rankValue,
    date: optionalDate(input.date),
    order,
    source: "self",
    eventType: "self-recorded"
  };
}

export function nextPromotionOrder(promotions) {
  return promotions.reduce((highest, item) => Math.max(highest, item.order), 0) + 1;
}

export function deriveCurrentRank(promotions) {
  const valid = promotions.filter((item) =>
    item && typeof item.id === "string" &&
    (item.rankType === "kyu" || item.rankType === "dan") &&
    Number.isInteger(item.rankValue) && item.rankValue > 0 &&
    Number.isInteger(item.order) && item.order > 0
  );
  if (valid.length === 0) return null;
  const current = [...valid].sort((left, right) => right.order - left.order)[0];
  return {
    source: current.source ?? "self",
    eventType: current.eventType ?? "self-recorded",
    ...current,
    label: current.rankValue + (current.rankType === "kyu" ? "급" : "단")
  };
}

function rankOrdinal(record) {
  if (record.rankType === "kyu" && Number.isInteger(record.rankValue) && record.rankValue >= 1 && record.rankValue <= 9) return 10 - record.rankValue;
  if (record.rankType === "dan" && Number.isSafeInteger(record.rankValue) && record.rankValue > 0) return 9 + record.rankValue;
  return null;
}

export function deriveCurrentRankWithOnboarding(promotions, onboardingState = null) {
  const verifiedPromotions = promotions.filter(item => item?.source === "samsungdang" && rankOrdinal(item) !== null)
    .map(item => ({ ...item, effectiveDate: item.date ?? item.recognizedAt ?? null, verifiedSource: "promotion" }));
  const onboarding = onboardingState?.ranks?.filter(item => rankOrdinal(item) !== null)
    .map(item => ({
      ...item,
      id: item.entryKey,
      date: item.rankDate,
      effectiveDate: item.rankDate ?? item.baselineAsOf ?? item.recognizedAt,
      source: "samsungdang-onboarding",
      eventType: "recognized-onboarding",
      verifiedSource: "onboarding",
      attributionAnchorDate: item.rankDate ?? item.baselineAsOf ?? item.recognizedAt
    })) ?? [];
  const verified = [...verifiedPromotions, ...onboarding];
  const candidates = verified.length > 0
    ? verified
    : promotions.filter(item => rankOrdinal(item) !== null).map(item => ({ ...item, effectiveDate: item.date ?? null }));
  if (candidates.length === 0) return null;
  const current = [...candidates].sort((left, right) =>
    rankOrdinal(right) - rankOrdinal(left) ||
    String(right.effectiveDate ?? "").localeCompare(String(left.effectiveDate ?? "")) ||
    String(right.registeredAt ?? right.order ?? "").localeCompare(String(left.registeredAt ?? left.order ?? "")) ||
    String(right.id ?? right.entryKey).localeCompare(String(left.id ?? left.entryKey))
  )[0];
  return { ...current, label: current.rankValue + (current.rankType === "kyu" ? "급" : "단") };
}

export function deriveVerifiedRankAtDate(promotions, onboardingState, sessionDate) {
  const verifiedPromotions = promotions.filter(item => item?.source === "samsungdang" && rankOrdinal(item) !== null)
    .map(item => ({ ...item, effectiveDate: item.date ?? item.recognizedAt ?? null, verifiedSource: "promotion" }));
  const onboarding = onboardingState?.ranks?.filter(item => rankOrdinal(item) !== null)
    .map(item => ({
      ...item,
      id: item.entryKey,
      date: item.rankDate,
      effectiveDate: item.rankDate ?? item.baselineAsOf ?? item.recognizedAt,
      source: "samsungdang-onboarding",
      eventType: "recognized-onboarding",
      verifiedSource: "onboarding"
    })) ?? [];
  const eligible = [...verifiedPromotions, ...onboarding]
    .filter(item => typeof item.effectiveDate === "string" && item.effectiveDate < sessionDate);
  if (eligible.length === 0) return null;
  const rank = eligible.sort((left, right) =>
    rankOrdinal(right) - rankOrdinal(left) ||
    right.effectiveDate.localeCompare(left.effectiveDate) ||
    String(right.registeredAt ?? right.order ?? "").localeCompare(String(left.registeredAt ?? left.order ?? ""))
  )[0];
  return { ...rank, label: rank.rankValue + (rank.rankType === "kyu" ? "급" : "단") };
}

export function planSchemaUpgrade(existingStores) {
  const phase3Stores = ["trainingSession", "sessionKata"];
  const v3Stores = ["memberProfile", "promotionHistory", "sharedSessionSnapshot"];
  return {
    preserve: phase3Stores.filter((name) => existingStores.includes(name)),
    create: v3Stores.filter((name) => !existingStores.includes(name))
  };
}

export function findCanonicalKata(catalog, id) {
  return catalog.kata.find((item) => item.id === id) ?? null;
}
