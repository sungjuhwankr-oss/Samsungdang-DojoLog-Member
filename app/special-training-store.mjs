import { verifySpecialTrainingCredentialToken } from "./credential/special-training-verifier.mjs";
import { loadStoredMembershipVerification } from "./membership-store.mjs";
import {
  assessSpecialTrainingCredential,
  createSpecialTrainingRecord,
  specialTrainingPayloadEqual,
  storedSpecialTrainingIdentity,
  validateStoredSpecialTrainingHistory
} from "./special-training-records.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import { SPECIAL_TRAINING_HISTORY_STORE } from "./training-records.mjs";

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
  return {
    verification,
    membershipVerification,
    assessment: assessSpecialTrainingCredential(verification, membershipVerification, history)
  };
}

function transactionDuplicateReason(verification, existingCredential, existingEvent) {
  if (existingCredential) return "credential-replay";
  if (!existingEvent) return "ready";
  const identity = storedSpecialTrainingIdentity(existingEvent);
  return specialTrainingPayloadEqual(identity.payload, verification.verifiedPayload)
    ? "event-replay"
    : "event-conflict";
}

export async function registerSpecialTrainingCredentialToken(token, options = {}) {
  const verifierOptions = options.verifierOptions ?? {};
  const verification = await verifySpecialTrainingCredentialToken(token, verifierOptions);
  if (!verification.valid || !verification.envelopeJson || !verification.verifiedPayload) {
    throw new SpecialTrainingRegistrationError("invalid-credential", verification.reason);
  }
  const factory = options.factory ?? indexedDB;
  const membershipVerification = await loadStoredMembershipVerification(factory, verifierOptions);
  if (!membershipVerification?.valid) {
    throw new SpecialTrainingRegistrationError("membership-required", "Membership Credential 등록 필요");
  }

  await listVerifiedSpecialTrainingHistory(factory, { verifierOptions });

  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(SPECIAL_TRAINING_HISTORY_STORE, "readwrite");
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(SPECIAL_TRAINING_HISTORY_STORE);
    const [existingCredential, existingEvent] = await Promise.all([
      requestResult(store.index("byCredentialId").get(verification.credentialId)),
      requestResult(store.get(verification.verifiedPayload.eventId))
    ]);
    let reason;
    try {
      reason = transactionDuplicateReason(verification, existingCredential, existingEvent);
    } catch {
      reason = "invalid-history";
    }
    if (reason !== "ready") {
      transaction.abort();
      await completion.catch(() => {});
      throw new SpecialTrainingRegistrationError(reason, reason);
    }
    const record = createSpecialTrainingRecord(
      verification,
      (options.now ?? (() => new Date().toISOString()))()
    );
    store.add(record);
    await completion;
    notifySpecialTrainingChanged();
    return { verification, assessment: { canConfirm: true, reason: "ready" }, record };
  } finally {
    database.close();
  }
}
