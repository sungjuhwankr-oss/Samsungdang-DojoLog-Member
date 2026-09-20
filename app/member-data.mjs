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
    order
  };
}

export function nextPromotionOrder(promotions) {
  return promotions.reduce((highest, item) => Math.max(highest, item.order), 0) + 1;
}

export function deriveCurrentRank(promotions) {
  if (promotions.length === 0) return null;
  const current = [...promotions].sort((left, right) => right.order - left.order)[0];
  return {
    ...current,
    label: current.rankValue + (current.rankType === "kyu" ? "급" : "단")
  };
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
