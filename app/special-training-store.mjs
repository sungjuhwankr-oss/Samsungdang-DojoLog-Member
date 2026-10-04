import { verifySpecialTrainingCredentialToken } from "./credential/special-training-verifier.mjs";
import { loadStoredMembershipVerification } from "./membership-store.mjs";
import {
  assessSpecialTrainingCredential,
  classifySpecialTrainingDuplicate,
  createSpecialTrainingRecord,
  validateStoredSpecialTrainingHistory
} from "./special-training-records.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import {
  CREDENTIAL_ARCHIVE_STORE,
  EVENT_CHANGE_HISTORY_STORE,
  EVENT_PARTICIPATION_STORE,
  SPECIAL_TRAINING_HISTORY_STORE
} from "./training-records.mjs";

export const SPECIAL_TRAINING_CHANGED_EVENT = "samsungdang-special-training-changed";

export class SpecialTrainingRegistrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SpecialTrainingRegistrationError";
    this.code = code;
  }
}

function notifySpecialTrainingChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SPECIAL_TRAINING_CHANGED_EVENT));
}

async function readRawHistory(factory) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(SPECIAL_TRAINING_HISTORY_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(SPECIAL_TRAINING_HISTORY_STORE).getAll());
    await transactionDone(transaction);
    return records;
  } finally {
    database.close();
  }
}

export async function listVerifiedSpecialTrainingHistory(factory = indexedDB, options = {}) {
  return validateStoredSpecialTrainingHistory(
    await readRawHistory(factory), options.verifierOptions ?? {}
  );
}

export async function previewSpecialTrainingCredentialToken(token, options = {}) {
  const verifierOptions = options.verifierOptions ?? {};
  const verification = await verifySpecialTrainingCredentialToken(token, verifierOptions);
  if (!verification.valid) return { verification, membershipVerification: null, assessment: null };
  const factory = options.factory ?? indexedDB;
  const membershipVerification = await loadStoredMembershipVerification(factory, verifierOptions);
  const history = await listVerifiedSpecialTrainingHistory(factory, { verifierOptions });
  let participation = null;
  if (verification.credentialVersion === 2) {
    const database = await openTrainingDatabase(factory);
    try {
      const transaction = database.transaction(EVENT_PARTICIPATION_STORE, "readonly");
      participation = await requestResult(
        transaction.objectStore(EVENT_PARTICIPATION_STORE).get(verification.verifiedPayload.eventId)
      ) ?? null;
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }
  return {
    verification,
    membershipVerification,
    assessment: assessSpecialTrainingCredential(verification, membershipVerification, history),
    participation
  };
}

function normalizedSelection(payload, selectedSessionIds) {
  if (!Array.isArray(payload.sessions)) return [];
  if (!Array.isArray(selectedSessionIds) || selectedSessionIds.length === 0) {
    throw new SpecialTrainingRegistrationError("session-selection-required", "참가 session을 한 개 이상 선택해야 합니다.");
  }
  const allowed = new Set(payload.sessions.map(session => session.sessionId));
  const selected = [];
  const seen = new Set();
  for (const sessionId of selectedSessionIds) {
    if (typeof sessionId !== "string" || !allowed.has(sessionId) || seen.has(sessionId)) {
      throw new SpecialTrainingRegistrationError("invalid-session-selection", "참가 session 선택이 현재 행사 정의와 일치하지 않습니다.");
    }
    seen.add(sessionId);
    selected.push(sessionId);
  }
  return selected;
}

function historyChange(eventId, before, after, changedAt) {
  return {
    changeId: `eh1_${crypto.randomUUID()}`,
    eventKey: `samsungdang:${eventId}`,
    kind: "participation-change",
    before: before === null ? null : structuredClone(before),
    after: structuredClone(after),
    changedAt
  };
}

function sameStoredRecord(left, right) {
  return left !== null && right !== null && left !== undefined && right !== undefined &&
    left.eventId === right.eventId && left.credentialId === right.credentialId &&
    left.keyId === right.keyId && left.envelopeJson === right.envelopeJson &&
    left.registeredAt === right.registeredAt;
}

export async function registerSpecialTrainingCredentialToken(token, options = {}) {
  const verifierOptions = options.verifierOptions ?? {};
  const verification = await verifySpecialTrainingCredentialToken(token, verifierOptions);
  if (!verification.valid || !verification.envelopeJson || !verification.verifiedPayload) {
    throw new SpecialTrainingRegistrationError("invalid-credential", verification.reason);
  }
  const factory = options.factory ?? indexedDB;
  const membershipVerification = await loadStoredMembershipVerification(factory, verifierOptions);
  const rawHistory = await readRawHistory(factory);
  const history = await validateStoredSpecialTrainingHistory(rawHistory, verifierOptions);
  const assessment = assessSpecialTrainingCredential(verification, membershipVerification, history);
  if (!assessment.canConfirm) throw new SpecialTrainingRegistrationError(assessment.reason, assessment.reason);
  const currentView = history.find(item => item.eventId === verification.verifiedPayload.eventId) ?? null;
  const requestedSessionIds = verification.credentialVersion === 2 &&
    !(assessment.reason === "correction" && currentView?.credentialVersion === 2)
    ? normalizedSelection(verification.verifiedPayload, options.selectedSessionIds)
    : [];
  const registeredAt = (options.now ?? (() => new Date().toISOString()))();

  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction([
      SPECIAL_TRAINING_HISTORY_STORE,
      EVENT_PARTICIPATION_STORE,
      EVENT_CHANGE_HISTORY_STORE,
      CREDENTIAL_ARCHIVE_STORE
    ], "readwrite");
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(SPECIAL_TRAINING_HISTORY_STORE);
    const [existingCredential, archivedCredential, existingEvent] = await Promise.all([
      requestResult(store.index("byCredentialId").get(verification.credentialId)),
      requestResult(transaction.objectStore(CREDENTIAL_ARCHIVE_STORE).get(verification.credentialId)),
      requestResult(store.get(verification.verifiedPayload.eventId))
    ]);
    const currentHistory = existingEvent
      ? history.filter(item => item.eventId === existingEvent.eventId)
      : [];
    const expectedCurrent = rawHistory.find(item => item.eventId === verification.verifiedPayload.eventId) ?? null;
    const staleCurrent = Boolean(existingEvent || expectedCurrent) && !sameStoredRecord(existingEvent, expectedCurrent);
    const reason = staleCurrent
      ? "stale-preview"
      : existingCredential || archivedCredential
      ? "credential-replay"
      : classifySpecialTrainingDuplicate(verification, currentHistory);
    if (reason !== "ready" && reason !== "correction") {
      transaction.abort();
      await completion.catch(() => {});
      throw new SpecialTrainingRegistrationError(reason, reason);
    }
    const record = createSpecialTrainingRecord(
      verification,
      registeredAt
    );
    if (reason === "correction") {
      transaction.objectStore(CREDENTIAL_ARCHIVE_STORE).add({
        credentialId: existingEvent.credentialId,
        domain: "special-training",
        eventId: existingEvent.eventId,
        archivedAt: registeredAt,
        envelopeJson: existingEvent.envelopeJson
      });
      store.put(record);
    } else {
      store.add(record);
    }
    let participation = null;
    if (verification.credentialVersion === 2) {
      const participationStore = transaction.objectStore(EVENT_PARTICIPATION_STORE);
      const before = await requestResult(participationStore.get(verification.verifiedPayload.eventId)) ?? null;
      const allowed = new Set(verification.verifiedPayload.sessions.map(session => session.sessionId));
      const reconciledSessionIds = assessment.reason === "correction" && currentView?.credentialVersion === 2
        ? (before?.selectedSessionIds ?? []).filter(sessionId => allowed.has(sessionId))
        : requestedSessionIds;
      participation = {
        eventId: verification.verifiedPayload.eventId,
        selectedSessionIds: reconciledSessionIds,
        updatedAt: registeredAt,
        revision: verification.verifiedPayload.revision
      };
      participationStore.put(participation);
      transaction.objectStore(EVENT_CHANGE_HISTORY_STORE).add(
        historyChange(verification.verifiedPayload.eventId, before, participation, registeredAt)
      );
    }
    await completion;
    notifySpecialTrainingChanged();
    return { verification, assessment, record, participation };
  } finally {
    database.close();
  }
}
