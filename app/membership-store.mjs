import {
  verifyMembershipCredentialJson,
  verifyMembershipCredentialToken
} from "./credential/membership-verifier.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import { SAMSUNGDANG_MEMBERSHIP_STORE } from "./training-records.mjs";

export const MEMBERSHIP_RECORD_ID = "current";
export const MEMBERSHIP_CHANGED_EVENT = "samsungdang-membership-changed";

export class MembershipRegistrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MembershipRegistrationError";
    this.code = code;
  }
}

function notifyMembershipChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MEMBERSHIP_CHANGED_EVENT));
}

export async function readStoredMembershipRecord(factory = indexedDB) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(SAMSUNGDANG_MEMBERSHIP_STORE, "readonly");
    const record = await requestResult(
      transaction.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE).get(MEMBERSHIP_RECORD_ID)
    );
    await transactionDone(transaction);
    return record ?? null;
  } finally {
    database.close();
  }
}

export async function loadStoredMembershipVerification(factory = indexedDB, verifierOptions = {}) {
  const record = await readStoredMembershipRecord(factory);
  if (!record || typeof record.envelopeJson !== "string") return null;
  const verification = await verifyMembershipCredentialJson(record.envelopeJson, verifierOptions);
  if (!verification.valid ||
      verification.credentialId !== record.credentialId ||
      verification.keyId !== record.keyId) {
    return { ...verification, valid: false, verifiedPayload: null };
  }
  return verification;
}

export async function registerMembershipCredentialToken(token, options = {}) {
  const verification = await verifyMembershipCredentialToken(token, options.verifierOptions);
  if (!verification.valid || !verification.envelopeJson) {
    throw new MembershipRegistrationError("invalid-credential", verification.reason);
  }

  const factory = options.factory ?? indexedDB;
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(SAMSUNGDANG_MEMBERSHIP_STORE, "readwrite");
    const store = transaction.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE);
    const existing = await requestResult(store.get(MEMBERSHIP_RECORD_ID));
    if (existing) {
      transaction.abort();
      if (existing.credentialId === verification.credentialId) {
        throw new MembershipRegistrationError("replay", "이미 등록된 Membership Credential입니다.");
      }
      throw new MembershipRegistrationError(
        "existing-membership",
        "다른 Membership Credential이 이미 등록되어 있습니다."
      );
    }

    store.add({
      id: MEMBERSHIP_RECORD_ID,
      credentialId: verification.credentialId,
      keyId: verification.keyId,
      envelopeJson: verification.envelopeJson,
      registeredAt: (options.now ?? (() => new Date().toISOString()))()
    });
    await transactionDone(transaction);
  } finally {
    database.close();
  }

  notifyMembershipChanged();
  return verification;
}
