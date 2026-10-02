import { verifyMemberOnboardingJson, verifyMemberOnboardingToken } from "./credential/onboarding-verifier.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import {
  BASELINE_CHANGE_HISTORY_STORE,
  CREDENTIAL_ARCHIVE_STORE,
  ONBOARDING_RANK_HISTORY_STORE,
  ONBOARDING_RECEIPT_STORE,
  PROGRESS_BASELINE_STORE,
  SAMSUNGDANG_MEMBERSHIP_STORE
} from "./training-records.mjs";

export const ONBOARDING_CHANGED_EVENT = "samsungdang-onboarding-changed";

export class OnboardingRegistrationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "OnboardingRegistrationError";
    this.code = code;
  }
}

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
}

function rankEntryKey(payload, rank) {
  return `${payload.onboardingId}\u0000${payload.revision}\u0000${rank.entryId}`;
}

function rankRecord(payload, rank, credentialId, registeredAt) {
  return {
    entryKey: rankEntryKey(payload, rank),
    onboardingId: payload.onboardingId,
    revision: payload.revision,
    entryId: rank.entryId,
    rankType: rank.rankType,
    rankValue: rank.rankValue,
    rankDate: rank.rankDate,
    recognizedAt: payload.recognizedAt,
    baselineAsOf: payload.baselineAsOf,
    credentialId,
    registeredAt
  };
}

function baselineRecords(payload, credentialId, registeredAt) {
  const rows = [{
    baselineId: `bl1_${credentialId}_rank`,
    kind: "current-rank-session",
    subjectId: payload.currentRankEntryId,
    value: payload.currentRankSessionBaseline,
    provenance: "instructor-provided",
    originCredentialId: credentialId,
    baselineAsOf: payload.baselineAsOf,
    updatedAt: registeredAt,
    revision: 1
  }];
  payload.kataBaselines.forEach((item, index) => rows.push({
    baselineId: `bl1_${credentialId}_kata_${index}`,
    kind: "kata",
    subjectId: item.kataId,
    value: item.count,
    provenance: "instructor-provided",
    originCredentialId: credentialId,
    baselineAsOf: payload.baselineAsOf,
    updatedAt: registeredAt,
    revision: 1
  }));
  return rows;
}

function baselineValueState(value) {
  return value === null ? { state: "unknown" } : { state: "known", value };
}

async function readAllState(factory) {
  const database = await openTrainingDatabase(factory);
  try {
    const tx = database.transaction([
      ONBOARDING_RECEIPT_STORE, ONBOARDING_RANK_HISTORY_STORE, PROGRESS_BASELINE_STORE
    ], "readonly");
    const [receipts, ranks, baselines] = await Promise.all([
      requestResult(tx.objectStore(ONBOARDING_RECEIPT_STORE).getAll()),
      requestResult(tx.objectStore(ONBOARDING_RANK_HISTORY_STORE).getAll()),
      requestResult(tx.objectStore(PROGRESS_BASELINE_STORE).getAll())
    ]);
    await transactionDone(tx);
    return { receipts, ranks, baselines };
  } finally {
    database.close();
  }
}

export async function loadActiveOnboardingState(factory = indexedDB, verifierOptions = {}) {
  const state = await readAllState(factory);
  if (state.receipts.length === 0) return null;
  if (state.receipts.length !== 1) throw new OnboardingRegistrationError("identity-conflict");
  const receipt = state.receipts[0];
  const verification = await verifyMemberOnboardingJson(receipt.envelopeJson, verifierOptions);
  if (!verification.valid || verification.credentialId !== receipt.credentialId ||
      verification.verifiedPayload.onboardingId !== receipt.onboardingId ||
      verification.verifiedPayload.revision !== receipt.revision ||
      verification.verifiedPayload.membership.memberId !== receipt.memberId) {
    throw new OnboardingRegistrationError("invalid-stored-onboarding");
  }
  const activeRanks = state.ranks.filter(row => row.onboardingId === receipt.onboardingId && row.revision === receipt.revision);
  return { receipt, verification, ranks: activeRanks, baselines: state.baselines };
}

export async function previewMemberOnboardingToken(token, options = {}) {
  const verification = await verifyMemberOnboardingToken(token, options.verifierOptions ?? {});
  if (!verification.valid) return { verification, assessment: null, current: null };
  const current = await loadActiveOnboardingState(options.factory ?? indexedDB, options.verifierOptions ?? {});
  return { verification, current, assessment: assessOnboarding(verification, current) };
}

export function assessOnboarding(verification, current) {
  if (!verification?.valid || !verification.verifiedPayload || !verification.credentialId) return { canConfirm: false, reason: "invalid-credential" };
  const payload = verification.verifiedPayload;
  if (!current) return { canConfirm: true, reason: "new" };
  const receipt = current.receipt;
  if (payload.onboardingId !== receipt.onboardingId) return { canConfirm: false, reason: "identity-conflict" };
  if (payload.membership.memberId !== receipt.memberId) return { canConfirm: false, reason: "identity-conflict" };
  if (verification.credentialId === receipt.credentialId) return { canConfirm: true, reason: "repair" };
  if (payload.revision === receipt.revision) {
    return JSON.stringify(payload) === receipt.payloadJson
      ? { canConfirm: false, reason: "reissue-replay" }
      : { canConfirm: false, reason: "revision-conflict" };
  }
  if (payload.revision < receipt.revision) return { canConfirm: false, reason: "revision-downgrade" };
  if (payload.revision > receipt.revision + 1) return { canConfirm: false, reason: "revision-skip" };
  if (payload.supersedesCredentialId !== receipt.credentialId) return { canConfirm: false, reason: "revision-fork" };
  return { canConfirm: true, reason: "correction" };
}

export async function registerMemberOnboardingToken(token, options = {}) {
  const verifierOptions = options.verifierOptions ?? {};
  const verification = await verifyMemberOnboardingToken(token, verifierOptions);
  if (!verification.valid || !verification.envelopeJson) throw new OnboardingRegistrationError("invalid-credential", verification.reason);
  const factory = options.factory ?? indexedDB;
  await loadActiveOnboardingState(factory, verifierOptions);
  const registeredAt = (options.now ?? (() => new Date().toISOString()))();
  const database = await openTrainingDatabase(factory);
  try {
    const tx = database.transaction([
      ONBOARDING_RECEIPT_STORE, ONBOARDING_RANK_HISTORY_STORE, PROGRESS_BASELINE_STORE,
      BASELINE_CHANGE_HISTORY_STORE, CREDENTIAL_ARCHIVE_STORE, SAMSUNGDANG_MEMBERSHIP_STORE
    ], "readwrite");
    const done = transactionDone(tx);
    const receipts = tx.objectStore(ONBOARDING_RECEIPT_STORE);
    const ranks = tx.objectStore(ONBOARDING_RANK_HISTORY_STORE);
    const baselines = tx.objectStore(PROGRESS_BASELINE_STORE);
    const baselineHistory = tx.objectStore(BASELINE_CHANGE_HISTORY_STORE);
    const archive = tx.objectStore(CREDENTIAL_ARCHIVE_STORE);
    const existingReceipts = await requestResult(receipts.getAll());
    if (existingReceipts.length > 1) {
      tx.abort(); await done.catch(() => {}); throw new OnboardingRegistrationError("identity-conflict");
    }
    const existing = existingReceipts[0] ?? null;
    const current = existing ? {
      receipt: existing,
      ranks: await requestResult(ranks.index("byOnboarding").getAll([existing.onboardingId, existing.revision]))
    } : null;
    const assessment = assessOnboarding(verification, current);
    if (!assessment.canConfirm) {
      tx.abort(); await done.catch(() => {}); throw new OnboardingRegistrationError(assessment.reason);
    }
    const membership = await requestResult(tx.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE).get("current"));
    if (membership && existing === null) {
      tx.abort(); await done.catch(() => {}); throw new OnboardingRegistrationError("identity-conflict");
    }
    const payload = verification.verifiedPayload;
    const rows = payload.recognizedRanks.map(rank => rankRecord(payload, rank, verification.credentialId, registeredAt));
    if (assessment.reason === "repair") {
      for (const row of rows) if (!(await requestResult(ranks.get(row.entryKey)))) ranks.add(row);
    } else {
      for (const row of rows) ranks.add(row);
      archive.put({
        credentialId: verification.credentialId, domain: "member-onboarding", archivedAt: registeredAt,
        onboardingId: payload.onboardingId, revision: payload.revision, envelopeJson: verification.envelopeJson
      });
      const first = existing === null;
      if (first) {
        const initialBaselines = baselineRecords(payload, verification.credentialId, registeredAt);
        initialBaselines.forEach((row, index) => {
          baselines.add(row);
          baselineHistory.add({
            changeId: `bc1_${verification.credentialId}_${index}`,
            baselineId: row.baselineId,
            actor: "instructor",
            before: { state: "unset" },
            after: baselineValueState(row.value),
            changedAt: registeredAt,
            sourceCredentialId: verification.credentialId
          });
        });
      }
      receipts.put({
        onboardingId: payload.onboardingId,
        revision: payload.revision,
        credentialId: verification.credentialId,
        memberId: payload.membership.memberId,
        payloadJson: JSON.stringify(payload),
        envelopeJson: verification.envelopeJson,
        activeRankEntryId: payload.currentRankEntryId,
        baselineAppliedAt: first ? registeredAt : existing.baselineAppliedAt,
        registeredAt
      });
    }
    await done;
    notifyChanged();
    return { verification, assessment };
  } finally {
    database.close();
  }
}

export async function updateProgressBaseline(baselineId, value, options = {}) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError("baseline value must be nonnegative integer or null");
  const factory = options.factory ?? indexedDB;
  const changedAt = (options.now ?? (() => new Date().toISOString()))();
  const database = await openTrainingDatabase(factory);
  try {
    const tx = database.transaction([PROGRESS_BASELINE_STORE, BASELINE_CHANGE_HISTORY_STORE], "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(PROGRESS_BASELINE_STORE);
    const current = await requestResult(store.get(baselineId));
    if (!current) { tx.abort(); await done.catch(() => {}); throw new OnboardingRegistrationError("baseline-not-found"); }
    const next = { ...current, value, provenance: "self-recorded", updatedAt: changedAt, revision: current.revision + 1 };
    store.put(next);
    tx.objectStore(BASELINE_CHANGE_HISTORY_STORE).add({
      changeId: `bc1_${crypto.randomUUID()}`,
      baselineId,
      actor: "member",
      before: baselineValueState(current.value),
      after: baselineValueState(value),
      changedAt,
      sourceCredentialId: current.originCredentialId
    });
    await done;
    notifyChanged();
    return next;
  } finally {
    database.close();
  }
}
