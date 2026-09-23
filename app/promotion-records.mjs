import { verifyPromotionCredentialJson } from "./credential/promotion-verifier.mjs";

const validDate = (value) => {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const validInstant = (value) => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
  !Number.isNaN(Date.parse(value));

export function normalizePromotionRecord(record) {
  if (record?.source === undefined && record?.eventType === undefined) {
    return { ...record, source: "self", eventType: "self-recorded" };
  }
  return { ...record };
}

export function isBasicPromotionRecord(record) {
  return record !== null && typeof record === "object" &&
    typeof record.id === "string" && record.id.length > 0 &&
    (record.rankType === "kyu" || record.rankType === "dan") &&
    Number.isInteger(record.rankValue) && record.rankValue > 0 &&
    validDate(record.date) && Number.isInteger(record.order) && record.order > 0;
}

export function rankOrdinal(rank) {
  if (rank === null) return 0;
  if (rank?.rankType === "kyu" && Number.isInteger(rank.rankValue) && rank.rankValue >= 1 && rank.rankValue <= 9) {
    return 10 - rank.rankValue;
  }
  if (rank?.rankType === "dan" && Number.isSafeInteger(rank.rankValue) && rank.rankValue > 0) {
    return 9 + rank.rankValue;
  }
  throw new Error("current-rank-invalid");
}

export function rankFromOrdinal(ordinal) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new Error("rank-ordinal-invalid");
  return ordinal <= 9
    ? { rankType: "kyu", rankValue: 10 - ordinal }
    : { rankType: "dan", rankValue: ordinal - 9 };
}

export function advanceOneRank(currentRank) {
  return rankFromOrdinal(rankOrdinal(currentRank) + 1);
}

export function currentPromotionRecord(history) {
  const valid = history.filter(isBasicPromotionRecord);
  if (valid.length === 0) return null;
  return [...valid].sort((left, right) => right.order - left.order)[0];
}

export function rankLabel(rank) {
  return `${rank.rankValue}${rank.rankType === "kyu" ? "급" : "단"}`;
}

function validMembership(verification) {
  return verification?.valid === true && verification.credentialType === "membership" &&
    verification.verifiedPayload !== null && typeof verification.verifiedPayload?.memberId === "string";
}

export function assessPromotionCredential(verification, membershipVerification, history) {
  if (!verification?.valid || verification.credentialType !== "promotion" ||
      !verification.verifiedPayload || !verification.credentialId || !verification.keyId || !verification.envelopeJson) {
    return { canConfirm: false, reason: "invalid-credential", currentRank: null, resultRank: null };
  }
  const normalized = history.map(normalizePromotionRecord);
  const currentRecord = currentPromotionRecord(normalized);
  const currentRank = currentRecord
    ? { rankType: currentRecord.rankType, rankValue: currentRecord.rankValue }
    : null;
  let resultRank;
  try {
    const payload = verification.verifiedPayload;
    resultRank = payload.mode === "advance-one" ? advanceOneRank(currentRank) : { ...payload.targetRank };
  } catch {
    return { canConfirm: false, reason: "current-rank-invalid", currentRank, resultRank: null };
  }

  const payload = verification.verifiedPayload;
  if (!validMembership(membershipVerification)) {
    return { canConfirm: false, reason: "membership-required", currentRank, resultRank };
  }
  if (payload.eventType === "recognized-at-entry" &&
      payload.memberId !== membershipVerification.verifiedPayload.memberId) {
    return { canConfirm: false, reason: "member-mismatch", currentRank, resultRank };
  }
  if (normalized.some((record) => record.id === verification.credentialId)) {
    return { canConfirm: false, reason: "replay", currentRank, resultRank };
  }
  if (payload.eventType === "promoted" && normalized.some((record) =>
    record.source === "samsungdang" && record.eventType === "promoted" && record.date === payload.examDate
  )) {
    return { canConfirm: false, reason: "exam-date-replay", currentRank, resultRank };
  }
  if (payload.mode === "target" && rankOrdinal(resultRank) <= rankOrdinal(currentRank)) {
    return { canConfirm: false, reason: "target-conflict", currentRank, resultRank };
  }
  return { canConfirm: true, reason: "ready", currentRank, resultRank };
}

export function createSamsungdangPromotionRecord(verification, assessment, order, registeredAt) {
  if (!validInstant(registeredAt)) throw new Error("registeredAt-invalid");
  const payload = verification.verifiedPayload;
  const envelopeJson = JSON.stringify(JSON.parse(verification.envelopeJson));
  const record = {
    id: verification.credentialId,
    rankType: assessment.resultRank.rankType,
    rankValue: assessment.resultRank.rankValue,
    date: payload.eventType === "promoted" ? payload.examDate : payload.rankDate,
    order,
    source: "samsungdang",
    eventType: payload.eventType,
    credentialId: verification.credentialId,
    keyId: verification.keyId,
    envelopeJson,
    registeredAt
  };
  if (payload.eventType === "recognized-at-entry") record.recognizedAt = payload.recognizedAt;
  return record;
}

function crossCheckRecord(record, verification, assessment) {
  const payload = verification.verifiedPayload;
  return record.source === "samsungdang" && record.id === verification.credentialId &&
    record.credentialId === verification.credentialId && record.keyId === verification.keyId &&
    record.eventType === payload.eventType && record.rankType === assessment.resultRank?.rankType &&
    record.rankValue === assessment.resultRank?.rankValue &&
    record.date === (payload.eventType === "promoted" ? payload.examDate : payload.rankDate) &&
    validInstant(record.registeredAt) &&
    (payload.eventType === "recognized-at-entry"
      ? record.recognizedAt === payload.recognizedAt
      : record.recognizedAt === undefined);
}

export async function validateStoredPromotionHistory(history, membershipVerification = null, verifierOptions = {}) {
  const ordered = [...history].sort((left, right) => left.order - right.order);
  const accepted = [];
  for (const raw of ordered) {
    if (!isBasicPromotionRecord(raw)) throw new Error("invalid-promotion-record");
    const record = normalizePromotionRecord(raw);
    if (record.source === "self" && record.eventType === "self-recorded") {
      accepted.push(record);
      continue;
    }
    if (record.source !== "samsungdang" ||
        (record.eventType !== "promoted" && record.eventType !== "recognized-at-entry") ||
        typeof record.envelopeJson !== "string") {
      throw new Error("invalid-promotion-provenance");
    }
    const verification = await verifyPromotionCredentialJson(record.envelopeJson, verifierOptions);
    const assessment = assessPromotionCredential(verification, membershipVerification, accepted);
    if ((!assessment.canConfirm && assessment.reason !== "membership-required") ||
        (record.eventType === "recognized-at-entry" && assessment.reason === "membership-required") ||
        !crossCheckRecord(record, verification, assessment)) {
      throw new Error("invalid-samsungdang-promotion");
    }
    accepted.push(record);
  }
  return accepted;
}
