import { createSharedSnapshot } from "./training-journal.mjs";
import {
  BASELINE_CHANGE_HISTORY_STORE,
  CREDENTIAL_ARCHIVE_STORE,
  EVENT_CHANGE_HISTORY_STORE,
  EVENT_MEMO_STORE,
  EVENT_PARTICIPATION_STORE,
  EXTERNAL_EVENT_STORE,
  MEMBER_PROFILE_STORE,
  ONBOARDING_RANK_HISTORY_STORE,
  ONBOARDING_RECEIPT_STORE,
  PROMOTION_HISTORY_STORE,
  PROGRESS_BASELINE_STORE,
  SAMSUNGDANG_MEMBERSHIP_STORE,
  SESSION_KATA_STORE,
  SHARED_SESSION_SNAPSHOT_STORE,
  SPECIAL_TRAINING_HISTORY_STORE,
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION,
  TRAINING_SESSION_STORE,
  normalizeTrainingSessionRecord
} from "./training-records.mjs";

function ensureIndex(store, name, keyPath, options) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

export function upgradeTrainingDatabase(request, oldVersion) {
  const database = request.result;
  const transaction = request.transaction;
  if (!transaction) throw new Error("IndexedDB upgrade transaction is unavailable");

  const sessions = database.objectStoreNames.contains(TRAINING_SESSION_STORE)
    ? transaction.objectStore(TRAINING_SESSION_STORE)
    : database.createObjectStore(TRAINING_SESSION_STORE, { keyPath: ["dojo", "sessionNo"] });
  ensureIndex(sessions, "byDate", "date");
  ensureIndex(sessions, "bySource", "source");

  const kata = database.objectStoreNames.contains(SESSION_KATA_STORE)
    ? transaction.objectStore(SESSION_KATA_STORE)
    : database.createObjectStore(SESSION_KATA_STORE, { keyPath: ["dojo", "sessionNo", "order"] });
  ensureIndex(kata, "bySession", ["dojo", "sessionNo"]);

  if (!database.objectStoreNames.contains(MEMBER_PROFILE_STORE)) {
    database.createObjectStore(MEMBER_PROFILE_STORE, { keyPath: "id" });
  }

  const promotions = database.objectStoreNames.contains(PROMOTION_HISTORY_STORE)
    ? transaction.objectStore(PROMOTION_HISTORY_STORE)
    : database.createObjectStore(PROMOTION_HISTORY_STORE, { keyPath: "id" });
  ensureIndex(promotions, "byOrder", "order", { unique: true });

  const snapshots = database.objectStoreNames.contains(SHARED_SESSION_SNAPSHOT_STORE)
    ? transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE)
    : database.createObjectStore(SHARED_SESSION_SNAPSHOT_STORE, { keyPath: ["dojo", "sessionNo"] });
  ensureIndex(snapshots, "byDate", "date");

  if (!database.objectStoreNames.contains(SAMSUNGDANG_MEMBERSHIP_STORE)) {
    database.createObjectStore(SAMSUNGDANG_MEMBERSHIP_STORE, { keyPath: "id" });
  }

  const specialTraining = database.objectStoreNames.contains(SPECIAL_TRAINING_HISTORY_STORE)
    ? transaction.objectStore(SPECIAL_TRAINING_HISTORY_STORE)
    : database.createObjectStore(SPECIAL_TRAINING_HISTORY_STORE, { keyPath: "eventId" });
  ensureIndex(specialTraining, "byCredentialId", "credentialId", { unique: true });

  const onboardingReceipt = database.objectStoreNames.contains(ONBOARDING_RECEIPT_STORE)
    ? transaction.objectStore(ONBOARDING_RECEIPT_STORE)
    : database.createObjectStore(ONBOARDING_RECEIPT_STORE, { keyPath: "onboardingId" });
  ensureIndex(onboardingReceipt, "byCredentialId", "credentialId", { unique: true });
  ensureIndex(onboardingReceipt, "byMemberId", "memberId", { unique: true });

  const onboardingRanks = database.objectStoreNames.contains(ONBOARDING_RANK_HISTORY_STORE)
    ? transaction.objectStore(ONBOARDING_RANK_HISTORY_STORE)
    : database.createObjectStore(ONBOARDING_RANK_HISTORY_STORE, { keyPath: "entryKey" });
  ensureIndex(onboardingRanks, "byOnboarding", ["onboardingId", "revision"]);
  ensureIndex(onboardingRanks, "byRankDate", "rankDate");

  const progressBaseline = database.objectStoreNames.contains(PROGRESS_BASELINE_STORE)
    ? transaction.objectStore(PROGRESS_BASELINE_STORE)
    : database.createObjectStore(PROGRESS_BASELINE_STORE, { keyPath: "baselineId" });
  ensureIndex(progressBaseline, "byKind", "kind");
  ensureIndex(progressBaseline, "bySubject", ["kind", "subjectId"], { unique: true });

  const baselineHistory = database.objectStoreNames.contains(BASELINE_CHANGE_HISTORY_STORE)
    ? transaction.objectStore(BASELINE_CHANGE_HISTORY_STORE)
    : database.createObjectStore(BASELINE_CHANGE_HISTORY_STORE, { keyPath: "changeId" });
  ensureIndex(baselineHistory, "byBaselineId", "baselineId");
  ensureIndex(baselineHistory, "byChangedAt", "changedAt");

  const credentialArchive = database.objectStoreNames.contains(CREDENTIAL_ARCHIVE_STORE)
    ? transaction.objectStore(CREDENTIAL_ARCHIVE_STORE)
    : database.createObjectStore(CREDENTIAL_ARCHIVE_STORE, { keyPath: "credentialId" });
  ensureIndex(credentialArchive, "byDomain", "domain");
  ensureIndex(credentialArchive, "byArchivedAt", "archivedAt");

  if (!database.objectStoreNames.contains(EVENT_PARTICIPATION_STORE)) {
    database.createObjectStore(EVENT_PARTICIPATION_STORE, { keyPath: "eventId" });
  }
  const eventHistory = database.objectStoreNames.contains(EVENT_CHANGE_HISTORY_STORE)
    ? transaction.objectStore(EVENT_CHANGE_HISTORY_STORE)
    : database.createObjectStore(EVENT_CHANGE_HISTORY_STORE, { keyPath: "changeId" });
  ensureIndex(eventHistory, "byEventKey", "eventKey");
  ensureIndex(eventHistory, "byChangedAt", "changedAt");

  const externalEvent = database.objectStoreNames.contains(EXTERNAL_EVENT_STORE)
    ? transaction.objectStore(EXTERNAL_EVENT_STORE)
    : database.createObjectStore(EXTERNAL_EVENT_STORE, { keyPath: "eventId" });
  ensureIndex(externalEvent, "byUpdatedAt", "updatedAt");
  ensureIndex(externalEvent, "byDeletedAt", "deletedAt");

  const eventMemo = database.objectStoreNames.contains(EVENT_MEMO_STORE)
    ? transaction.objectStore(EVENT_MEMO_STORE)
    : database.createObjectStore(EVENT_MEMO_STORE, { keyPath: "eventKey" });
  ensureIndex(eventMemo, "byUpdatedAt", "updatedAt");

  if (oldVersion < 3) {
    const kataRequest = kata.getAll();
    kataRequest.onsuccess = () => {
      const kataRows = kataRequest.result;
      const cursorRequest = sessions.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const migrated = normalizeTrainingSessionRecord(cursor.value);
        cursor.update(migrated);
        snapshots.put(createSharedSnapshot(migrated, kataRows));
        cursor.continue();
      };
    };
  }
}

export function openTrainingDatabase(factory = indexedDB) {
  return new Promise((resolve, reject) => {
    const request = factory.open(TRAINING_DB_NAME, TRAINING_DB_VERSION);
    request.onupgradeneeded = (event) => upgradeTrainingDatabase(request, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열 수 없습니다."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade가 다른 창에 의해 차단되었습니다."));
  });
}

export function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}
