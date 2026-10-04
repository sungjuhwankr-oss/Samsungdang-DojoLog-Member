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
  if (left?.eventId !== right?.eventId || left?.title !== right?.title ||
      left?.category !== right?.category || left?.startDate !== right?.startDate ||
      left?.endDate !== right?.endDate || left?.instructor !== right?.instructor) return false;
  const leftV2 = Array.isArray(left?.sessions);
  const rightV2 = Array.isArray(right?.sessions);
  if (!leftV2 || !rightV2) return leftV2 === rightV2;
  return left.revision === right.revision &&
    left.supersedesCredentialId === right.supersedesCredentialId &&
    left.sessions.length === right.sessions.length &&
    left.sessions.every((session, index) => {
      const other = right.sessions[index];
      return session.sessionId === other?.sessionId && session.date === other?.date && session.label === other?.label;
    });
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
  const incomingVersion = verification.credentialVersion ?? 1;
  const currentVersion = sameEvent.credentialVersion ?? 1;
  if (incomingVersion === 1) {
    if (currentVersion === 2) return "revision-downgrade";
    return specialTrainingPayloadEqual(sameEvent.payload ?? sameEvent, verification.verifiedPayload)
      ? "event-replay"
      : "event-conflict";
  }
  const incoming = verification.verifiedPayload;
  if (currentVersion === 1) {
    return incoming.revision === 1 && incoming.supersedesCredentialId === sameEvent.credentialId
      ? "correction"
      : "revision-fork";
  }
  const current = sameEvent.payload ?? sameEvent;
  if (incoming.revision === current.revision) {
    return specialTrainingPayloadEqual(current, incoming) ? "event-replay" : "revision-conflict";
  }
  if (incoming.revision < current.revision) return "revision-downgrade";
  if (incoming.revision > current.revision + 1) return "revision-skip";
  if (incoming.supersedesCredentialId !== sameEvent.credentialId) return "revision-fork";
  const currentSessions = new Map(current.sessions.map(session => [session.sessionId, session]));
  for (const session of incoming.sessions) {
    const previous = currentSessions.get(session.sessionId);
    if (previous && (previous.date !== session.date || previous.label !== session.label)) {
      return "session-identity-conflict";
    }
  }
  return "correction";
}

export function assessSpecialTrainingCredential(verification, _membershipVerification, history) {
  if (!verifiedIdentity(verification)) return { canConfirm: false, reason: "invalid-credential" };
  const reason = classifySpecialTrainingDuplicate(verification, history);
  return { canConfirm: reason === "ready" || reason === "correction", reason };
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
      payload: verification.verifiedPayload,
      credentialVersion: verification.credentialVersion ?? 1,
      registeredAt: record.registeredAt
    });
  }
  return views.sort(compareViews);
}
