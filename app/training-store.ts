import type { SessionPayload } from "./session-share.mjs";
import {
  createTrainingRecords,
  classifyExistingSession,
  hydrateTrainingSessions,
  SESSION_KATA_STORE,
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION,
  TRAINING_SESSION_STORE,
  type HydratedTrainingSession,
  type SaveResult,
  type SessionKataRecord,
  type TrainingSessionRecord
} from "./training-records.mjs";

export {
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION
} from "./training-records.mjs";

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new Error("IndexedDB transaction failed")
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error("IndexedDB transaction aborted")
    );
  });
}

function openTrainingDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(TRAINING_DB_NAME, TRAINING_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(TRAINING_SESSION_STORE)) {
        database.createObjectStore(TRAINING_SESSION_STORE, {
          keyPath: ["dojo", "sessionNo"]
        });
      }

      if (!database.objectStoreNames.contains(SESSION_KATA_STORE)) {
        const kataStore = database.createObjectStore(SESSION_KATA_STORE, {
          keyPath: ["dojo", "sessionNo", "order"]
        });
        kataStore.createIndex("bySession", ["dojo", "sessionNo"]);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error ?? new Error("IndexedDB를 열 수 없습니다.")
    );
    request.onblocked = () => reject(
      new Error("IndexedDB upgrade가 다른 창에 의해 차단되었습니다.")
    );
  });
}

export async function saveTrainingSessionToIndexedDb(
  payload: SessionPayload
): Promise<SaveResult> {
  const database = await openTrainingDatabase();

  try {
    const transaction = database.transaction(
      [TRAINING_SESSION_STORE, SESSION_KATA_STORE],
      "readwrite"
    );
    const sessions = transaction.objectStore(TRAINING_SESSION_STORE);
    const kataStore = transaction.objectStore(SESSION_KATA_STORE);
    const existing = await requestResult<TrainingSessionRecord | undefined>(
      sessions.get([payload.dojo, payload.sessionNo])
    );
    const decision = classifyExistingSession(existing, payload);

    if (decision.status === "saved") {
      const records = createTrainingRecords(payload, new Date().toISOString());
      sessions.put(records.session);
      for (const kata of records.kata) kataStore.put(kata);
    }

    await transactionDone(transaction);
    return decision;
  } finally {
    database.close();
  }
}

export async function listTrainingSessions(): Promise<HydratedTrainingSession[]> {
  const database = await openTrainingDatabase();

  try {
    const transaction = database.transaction(
      [TRAINING_SESSION_STORE, SESSION_KATA_STORE],
      "readonly"
    );
    const sessionsRequest = transaction
      .objectStore(TRAINING_SESSION_STORE)
      .getAll() as IDBRequest<TrainingSessionRecord[]>;
    const kataRequest = transaction
      .objectStore(SESSION_KATA_STORE)
      .getAll() as IDBRequest<SessionKataRecord[]>;

    const [sessions, kata] = await Promise.all([
      requestResult(sessionsRequest),
      requestResult(kataRequest)
    ]);
    await transactionDone(transaction);
    return hydrateTrainingSessions(sessions, kata);
  } finally {
    database.close();
  }
}
