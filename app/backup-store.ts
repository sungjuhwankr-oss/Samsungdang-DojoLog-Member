import { createBackup, validateBackupObject } from "./backup.mjs";
import type { MemberBackup, MemberBackupData } from "./backup.mjs";
import { MEMBER_PROFILE_STORE, PROMOTION_HISTORY_STORE, SESSION_KATA_STORE, TRAINING_DB_NAME, TRAINING_DB_VERSION, TRAINING_SESSION_STORE } from "./training-records.mjs";
import type { MemberProfile, PromotionRecord } from "./member-data.mjs";
import type { SessionKataRecord, TrainingSessionRecord } from "./training-records.mjs";

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 요청에 실패했습니다."));
  });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 작업에 실패했습니다."));
  });
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TRAINING_DB_NAME, TRAINING_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRAINING_SESSION_STORE)) db.createObjectStore(TRAINING_SESSION_STORE, { keyPath: ["dojo", "sessionNo"] });
      if (!db.objectStoreNames.contains(SESSION_KATA_STORE)) {
        const store = db.createObjectStore(SESSION_KATA_STORE, { keyPath: ["dojo", "sessionNo", "order"] });
        store.createIndex("bySession", ["dojo", "sessionNo"]);
      }
      if (!db.objectStoreNames.contains(MEMBER_PROFILE_STORE)) db.createObjectStore(MEMBER_PROFILE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROMOTION_HISTORY_STORE)) {
        const store = db.createObjectStore(PROMOTION_HISTORY_STORE, { keyPath: "id" });
        store.createIndex("byOrder", "order", { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열 수 없습니다."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade가 차단되었습니다."));
  });
}
const stores = [TRAINING_SESSION_STORE, SESSION_KATA_STORE, MEMBER_PROFILE_STORE, PROMOTION_HISTORY_STORE] as const;

export async function readBackupDataFromIndexedDb(): Promise<MemberBackupData> {
  const db = await openDatabase();
  try {
    const tx = db.transaction([...stores], "readonly");
    const [trainingSession, sessionKata, memberProfile, promotionHistory] = await Promise.all([
      result<TrainingSessionRecord[]>(tx.objectStore(TRAINING_SESSION_STORE).getAll()),
      result<SessionKataRecord[]>(tx.objectStore(SESSION_KATA_STORE).getAll()),
      result<MemberProfile[]>(tx.objectStore(MEMBER_PROFILE_STORE).getAll()),
      result<PromotionRecord[]>(tx.objectStore(PROMOTION_HISTORY_STORE).getAll())
    ]);
    await done(tx);
    return { memberProfile, promotionHistory, trainingSession, sessionKata };
  } finally { db.close(); }
}
export async function createIndexedDbBackup(): Promise<MemberBackup> {
  return createBackup(await readBackupDataFromIndexedDb());
}
export async function restoreIndexedDbBackup(value: unknown): Promise<void> {
  const backup = validateBackupObject(value);
  const db = await openDatabase();
  try {
    const tx = db.transaction([...stores], "readwrite");
    const training = tx.objectStore(TRAINING_SESSION_STORE);
    const kata = tx.objectStore(SESSION_KATA_STORE);
    const profile = tx.objectStore(MEMBER_PROFILE_STORE);
    const promotions = tx.objectStore(PROMOTION_HISTORY_STORE);
    training.clear(); kata.clear(); profile.clear(); promotions.clear();
    for (const record of backup.data.trainingSession) training.put(record);
    for (const record of backup.data.sessionKata) kata.put(record);
    for (const record of backup.data.memberProfile) profile.put(record);
    for (const record of backup.data.promotionHistory) promotions.put(record);
    await done(tx);
  } finally { db.close(); }
}

