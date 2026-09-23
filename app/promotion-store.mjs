import { verifyPromotionCredentialToken } from "./credential/promotion-verifier.mjs";
import { loadStoredMembershipVerification } from "./membership-store.mjs";
import {
  assessPromotionCredential,
  createSamsungdangPromotionRecord,
  isBasicPromotionRecord,
  validateStoredPromotionHistory
} from "./promotion-records.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import { PROMOTION_HISTORY_STORE } from "./training-records.mjs";

export const PROMOTION_CHANGED_EVENT = "samsungdang-promotion-changed";

export class PromotionRegistrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PromotionRegistrationError";
    this.code = code;
  }
}

function notifyPromotionChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROMOTION_CHANGED_EVENT));
}

async function readRawHistory(factory) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(PROMOTION_HISTORY_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(PROMOTION_HISTORY_STORE).getAll());
    await transactionDone(transaction);
    return records;
  } finally {
    database.close();
  }
}

export async function listVerifiedPromotionHistory(factory = indexedDB, options = {}) {
  const membership = await loadStoredMembershipVerification(factory, options.verifierOptions ?? {});
  return validateStoredPromotionHistory(await readRawHistory(factory), membership, options.verifierOptions ?? {});
}

export async function previewPromotionCredentialToken(token, options = {}) {
  const verifierOptions = options.verifierOptions ?? {};
  const verification = await verifyPromotionCredentialToken(token, verifierOptions);
  if (!verification.valid) return { verification, assessment: null, membershipVerification: null };
  const factory = options.factory ?? indexedDB;
  const membershipVerification = await loadStoredMembershipVerification(factory, verifierOptions);
  const history = await validateStoredPromotionHistory(
    await readRawHistory(factory), membershipVerification, verifierOptions
  );
  return {
    verification,
    membershipVerification,
    assessment: assessPromotionCredential(verification, membershipVerification, history)
  };
}

export async function registerPromotionCredentialToken(token, options = {}) {
  const verifierOptions = options.verifierOptions ?? {};
  const verification = await verifyPromotionCredentialToken(token, verifierOptions);
  if (!verification.valid || !verification.envelopeJson) {
    throw new PromotionRegistrationError("invalid-credential", verification.reason);
  }
  const factory = options.factory ?? indexedDB;
  const membershipVerification = await loadStoredMembershipVerification(factory, verifierOptions);
  if (!membershipVerification?.valid) {
    throw new PromotionRegistrationError("membership-required", "Membership Credential 등록 필요");
  }

  await validateStoredPromotionHistory(
    await readRawHistory(factory), membershipVerification, verifierOptions
  );

  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(PROMOTION_HISTORY_STORE, "readwrite");
    const completion = transactionDone(transaction);
    const store = transaction.objectStore(PROMOTION_HISTORY_STORE);
    const currentHistory = await requestResult(store.getAll());
    if (!currentHistory.every(isBasicPromotionRecord)) {
      transaction.abort();
      await completion.catch(() => {});
      throw new PromotionRegistrationError("invalid-history", "현재 승급이력 구조가 올바르지 않습니다.");
    }
    const assessment = assessPromotionCredential(verification, membershipVerification, currentHistory);
    if (!assessment.canConfirm) {
      transaction.abort();
      await completion.catch(() => {});
      throw new PromotionRegistrationError(assessment.reason, assessment.reason);
    }
    const order = currentHistory.reduce((highest, record) => Math.max(highest, record.order), 0) + 1;
    const record = createSamsungdangPromotionRecord(
      verification,
      assessment,
      order,
      (options.now ?? (() => new Date().toISOString()))()
    );
    store.add(record);
    await completion;
    notifyPromotionChanged();
    return { verification, assessment, record };
  } finally {
    database.close();
  }
}
