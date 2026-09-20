import type { SessionPayload } from "./session-share.mjs";
import { createMemberProfile, createPromotion, nextPromotionOrder } from "./member-data.mjs";
import type { MemberProfile, MemberProfileInput, PromotionInput, PromotionRecord } from "./member-data.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import {
  createPersonalTrainingRecords,
  createSharedSnapshot,
  nextPersonalSessionNo,
  prepareTrainingSessionUpdate,
  restoreSharedSessionRecords,
  type TrainingSessionInput
} from "./training-journal.mjs";
import {
  createTrainingRecords,
  classifyExistingSession,
  hydrateTrainingSessions,
  SESSION_KATA_STORE,
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE,
  SHARED_SESSION_SNAPSHOT_STORE,
  TRAINING_SESSION_STORE,
  type HydratedTrainingSession,
  type SaveResult,
  type SessionKataRecord,
  type SharedSessionSnapshotRecord,
  type TrainingSessionRecord
} from "./training-records.mjs";

export {
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION
} from "./training-records.mjs";

export const TRAINING_DATA_CHANGED_EVENT = "samsungdang-training-data-changed";

function notifyTrainingDataChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TRAINING_DATA_CHANGED_EVENT));
}

async function replaceSessionKata(
  store: IDBObjectStore,
  dojo: string,
  sessionNo: number,
  rows: SessionKataRecord[]
) {
  const keys = await requestResult<IDBValidKey[]>(
    store.index("bySession").getAllKeys([dojo, sessionNo])
  );
  for (const key of keys) store.delete(key);
  for (const row of rows) store.put(row);
}

export async function saveTrainingSessionToIndexedDb(
  payload: SessionPayload
): Promise<SaveResult> {
  const database = await openTrainingDatabase();

  try {
    const transaction = database.transaction(
      [TRAINING_SESSION_STORE, SESSION_KATA_STORE, SHARED_SESSION_SNAPSHOT_STORE],
      "readwrite"
    );
    const sessions = transaction.objectStore(TRAINING_SESSION_STORE);
    const kataStore = transaction.objectStore(SESSION_KATA_STORE);
    const snapshots = transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE);
    const existing = await requestResult<TrainingSessionRecord | undefined>(
      sessions.get([payload.dojo, payload.sessionNo])
    );
    const decision = classifyExistingSession(existing, payload);

    if (decision.status === "saved") {
      const records = createTrainingRecords(payload, new Date().toISOString());
      sessions.put(records.session);
      for (const kata of records.kata) kataStore.put(kata);
      snapshots.add(createSharedSnapshot(records.session, records.kata));
    }

    await transactionDone(transaction);
    if (decision.status === "saved") notifyTrainingDataChanged();
    return decision;
  } finally {
    database.close();
  }
}

export async function createPersonalTrainingSession(
  input: TrainingSessionInput
): Promise<HydratedTrainingSession> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(
      [TRAINING_SESSION_STORE, SESSION_KATA_STORE],
      "readwrite"
    );
    const sessions = transaction.objectStore(TRAINING_SESSION_STORE);
    const existing = await requestResult<TrainingSessionRecord[]>(sessions.getAll());
    const records = createPersonalTrainingRecords(
      input,
      nextPersonalSessionNo(existing),
      new Date().toISOString()
    );
    sessions.add(records.session);
    const kataStore = transaction.objectStore(SESSION_KATA_STORE);
    for (const row of records.kata) kataStore.add(row);
    await transactionDone(transaction);
    notifyTrainingDataChanged();
    return {
      ...records.session,
      kata: records.kata.map((row) => ({ id: row.kataId, name: row.kataName, order: row.order }))
    };
  } finally {
    database.close();
  }
}

export async function updateTrainingSession(
  dojo: string,
  sessionNo: number,
  input: TrainingSessionInput
): Promise<HydratedTrainingSession> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(
      [TRAINING_SESSION_STORE, SESSION_KATA_STORE],
      "readwrite"
    );
    const sessions = transaction.objectStore(TRAINING_SESSION_STORE);
    const existing = await requestResult<TrainingSessionRecord | undefined>(sessions.get([dojo, sessionNo]));
    if (!existing) throw new Error("수련일지를 찾을 수 없습니다.");
    const records = prepareTrainingSessionUpdate(existing, input);
    sessions.put(records.session);
    await replaceSessionKata(transaction.objectStore(SESSION_KATA_STORE), dojo, sessionNo, records.kata);
    await transactionDone(transaction);
    notifyTrainingDataChanged();
    return {
      ...records.session,
      kata: records.kata.map((row) => ({ id: row.kataId, name: row.kataName, order: row.order }))
    };
  } finally {
    database.close();
  }
}

export async function deletePersonalTrainingSession(dojo: string, sessionNo: number): Promise<void> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(
      [TRAINING_SESSION_STORE, SESSION_KATA_STORE],
      "readwrite"
    );
    const sessions = transaction.objectStore(TRAINING_SESSION_STORE);
    const existing = await requestResult<TrainingSessionRecord | undefined>(sessions.get([dojo, sessionNo]));
    if (!existing || existing.source !== "personal") throw new Error("개인수련만 삭제할 수 있습니다.");
    sessions.delete([dojo, sessionNo]);
    await replaceSessionKata(transaction.objectStore(SESSION_KATA_STORE), dojo, sessionNo, []);
    await transactionDone(transaction);
    notifyTrainingDataChanged();
  } finally {
    database.close();
  }
}

export async function getSharedSessionSnapshot(
  dojo: string,
  sessionNo: number
): Promise<SharedSessionSnapshotRecord | null> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(SHARED_SESSION_SNAPSHOT_STORE, "readonly");
    const snapshot = await requestResult<SharedSessionSnapshotRecord | undefined>(
      transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE).get([dojo, sessionNo])
    );
    await transactionDone(transaction);
    return snapshot ?? null;
  } finally {
    database.close();
  }
}

export async function restoreSharedTrainingSession(
  dojo: string,
  sessionNo: number
): Promise<HydratedTrainingSession> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(
      [TRAINING_SESSION_STORE, SESSION_KATA_STORE, SHARED_SESSION_SNAPSHOT_STORE],
      "readwrite"
    );
    const sessions = transaction.objectStore(TRAINING_SESSION_STORE);
    const existing = await requestResult<TrainingSessionRecord | undefined>(sessions.get([dojo, sessionNo]));
    const snapshot = await requestResult<SharedSessionSnapshotRecord | undefined>(
      transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE).get([dojo, sessionNo])
    );
    if (!existing || !snapshot) throw new Error("공유 원본을 찾을 수 없습니다.");
    const records = restoreSharedSessionRecords(existing, snapshot);
    sessions.put(records.session);
    await replaceSessionKata(transaction.objectStore(SESSION_KATA_STORE), dojo, sessionNo, records.kata);
    await transactionDone(transaction);
    notifyTrainingDataChanged();
    return {
      ...records.session,
      kata: records.kata.map((row) => ({ id: row.kataId, name: row.kataName, order: row.order }))
    };
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


export async function getMemberProfile(): Promise<MemberProfile | null> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(MEMBER_PROFILE_STORE, "readonly");
    const profile = await requestResult<MemberProfile | undefined>(
      transaction.objectStore(MEMBER_PROFILE_STORE).get("self")
    );
    await transactionDone(transaction);
    return profile ?? null;
  } finally {
    database.close();
  }
}

export async function saveMemberProfile(input: MemberProfileInput): Promise<MemberProfile> {
  const profile = createMemberProfile(input);
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(MEMBER_PROFILE_STORE, "readwrite");
    transaction.objectStore(MEMBER_PROFILE_STORE).put(profile);
    await transactionDone(transaction);
    return profile;
  } finally {
    database.close();
  }
}

export async function listPromotionHistory(): Promise<PromotionRecord[]> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(PROMOTION_HISTORY_STORE, "readonly");
    const records = await requestResult<PromotionRecord[]>(
      transaction.objectStore(PROMOTION_HISTORY_STORE).getAll() as IDBRequest<PromotionRecord[]>
    );
    await transactionDone(transaction);
    return records.sort((left, right) => left.order - right.order);
  } finally {
    database.close();
  }
}

export async function addPromotion(input: PromotionInput): Promise<PromotionRecord> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(PROMOTION_HISTORY_STORE, "readwrite");
    const store = transaction.objectStore(PROMOTION_HISTORY_STORE);
    const existing = await requestResult<PromotionRecord[]>(
      store.getAll() as IDBRequest<PromotionRecord[]>
    );
    const order = nextPromotionOrder(existing);
    const promotion = createPromotion(input, order, crypto.randomUUID());
    store.add(promotion);
    await transactionDone(transaction);
    return promotion;
  } finally {
    database.close();
  }
}
