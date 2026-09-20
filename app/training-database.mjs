import { createSharedSnapshot } from "./training-journal.mjs";
import {
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE,
  SESSION_KATA_STORE,
  SHARED_SESSION_SNAPSHOT_STORE,
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
