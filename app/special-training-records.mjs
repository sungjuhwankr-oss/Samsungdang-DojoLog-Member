import { verifySpecialTrainingCredentialJson } from "./credential/special-training-verifier.mjs";

const RECORD_FIELDS = ["eventId", "credentialId", "keyId", "envelopeJson", "registeredAt"];

const exactFields = (value, fields) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
};

const validInstant = (value) => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
  !Number.isNaN(Date.parse(value));

export function specialTrainingPayloadEqual(left, right) {
  return left?.eventId === right?.eventId && left?.title === right?.title &&
    left?.category === right?.category && left?.startDate === right?.startDate &&
    left?.endDate === right?.endDate && left?.instructor === right?.instructor;
}

function validMembership(verification) {
  return verification?.valid === true && verification.credentialType === "membership" &&
    verification.verifiedPayload !== null;
}

function verifiedIdentity(verification) {
  return verification?.valid === true && verification.credentialType === "special-training" &&
    verification.verifiedPayload && verification.credentialId && verification.keyId &&
    verification.envelopeJson;
}

export function classifySpecialTrainingDuplicate(verification, history) {
  if (!verifiedIdentity(verification)) return "invalid-credential";
  if (history.some((item) => item.credentialId === verification.credentialId)) {
    return "credential-replay";
  }
  const sameEvent = history.find((item) => item.eventId === verification.verifiedPayload.eventId);
  if (!sameEvent) return "ready";
  return specialTrainingPayloadEqual(sameEvent, verification.verifiedPayload)
    ? "event-replay"
    : "event-conflict";
}

export function assessSpecialTrainingCredential(verification, membershipVerification, history) {
  if (!verifiedIdentity(verification)) return { canConfirm: false, reason: "invalid-credential" };
  if (!validMembership(membershipVerification)) return { canConfirm: false, reason: "membership-required" };
  const reason = classifySpecialTrainingDuplicate(verification, history);
  return { canConfirm: reason === "ready", reason };
}

export function createSpecialTrainingRecord(verification, registeredAt) {
  if (!verifiedIdentity(verification)) throw new Error("invalid-credential");
  if (!validInstant(registeredAt)) throw new Error("registeredAt-invalid");
  return {
    eventId: verification.verifiedPayload.eventId,
    credentialId: verification.credentialId,
    keyId: verification.keyId,
    envelopeJson: JSON.stringify(JSON.parse(verification.envelopeJson)),
    registeredAt
  };
}

export function storedSpecialTrainingIdentity(record) {
  if (!exactFields(record, RECORD_FIELDS) || !validInstant(record.registeredAt) ||
      typeof record.eventId !== "string" || typeof record.credentialId !== "string" ||
      typeof record.keyId !== "string" || typeof record.envelopeJson !== "string") {
    throw new Error("invalid-special-training-record");
  }
  let envelope;
  try {
    envelope = JSON.parse(record.envelopeJson);
  } catch {
    throw new Error("invalid-special-training-record");
  }
  const payload = envelope?.signed?.payload;
  if (!payload || record.eventId !== payload.eventId ||
      record.credentialId !== envelope?.signed?.credentialId ||
      record.keyId !== envelope?.signed?.keyId) {
    throw new Error("invalid-special-training-record");
  }
  return { eventId: record.eventId, credentialId: record.credentialId, payload };
}

function compareViews(left, right) {
  return right.startDate.localeCompare(left.startDate) ||
    (right.endDate ?? "").localeCompare(left.endDate ?? "") ||
    left.title.localeCompare(right.title, "ko") ||
    left.eventId.localeCompare(right.eventId);
}

export async function validateStoredSpecialTrainingHistory(records, verifierOptions = {}) {
  const eventIds = new Set();
  const credentialIds = new Set();
  const views = [];
  for (const record of records) {
    storedSpecialTrainingIdentity(record);
    if (eventIds.has(record.eventId) || credentialIds.has(record.credentialId)) {
      throw new Error("duplicate-special-training-record");
    }
    const verification = await verifySpecialTrainingCredentialJson(record.envelopeJson, verifierOptions);
    if (!verifiedIdentity(verification) ||
        verification.verifiedPayload.eventId !== record.eventId ||
        verification.credentialId !== record.credentialId || verification.keyId !== record.keyId) {
      throw new Error("invalid-samsungdang-special-training");
    }
    eventIds.add(record.eventId);
    credentialIds.add(record.credentialId);
    views.push({
      eventId: record.eventId,
      credentialId: record.credentialId,
      keyId: record.keyId,
      ...verification.verifiedPayload,
      registeredAt: record.registeredAt
    });
  }
  return views.sort(compareViews);
}
