import assert from "node:assert/strict";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { readBackupV1Data, restoreBackupV1ToIndexedDb } from "../app/backup-indexeddb.mjs";
import { createBackup } from "../app/backup.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "../app/training-database.mjs";
import { SESSION_KATA_STORE, TRAINING_SESSION_STORE } from "../app/training-records.mjs";

const timestamp = "2026-11-01T00:00:00.000Z";
const session = (dojo, sessionNo, source, note = "") => ({
  dojo,
  sessionNo,
  date: "2026-11-01",
  importedAt: timestamp,
  sourceSchema: source === "personal" ? "samsungdang-dojolog-personal-session" : "samsungdang-dojolog-session",
  sourceVersion: 1,
  source,
  note
});
const kata = (dojo, sessionNo, order, kataId) => ({
  dojo, sessionNo, order, kataId, kataName: `Kata ${kataId}`
});

async function putRows(factory, sessions, kataRows) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction([TRAINING_SESSION_STORE, SESSION_KATA_STORE], "readwrite");
    for (const row of sessions) transaction.objectStore(TRAINING_SESSION_STORE).put(row);
    for (const row of kataRows) transaction.objectStore(SESSION_KATA_STORE).put(row);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

async function all(factory, storeName) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(storeName, "readonly");
    const rows = await requestResult(transaction.objectStore(storeName).getAll());
    await transactionDone(transaction);
    return rows;
  } finally {
    database.close();
  }
}

test("Backup v1 same-device restore preserves personal sessions, Kata, and notes while replacing shared rows", async () => {
  const factory = new IDBFactory();
  const personal = [
    session("__personal__", 1, "personal", "개인 수련 메모"),
    session("__personal__", 2, "personal", "Kata 없는 개인 수련")
  ];
  const personalKata = [kata("__personal__", 1, 0, "p-1"), kata("__personal__", 1, 1, "p-2")];
  const originalShared = session("samsungdang", 42, "shared");
  const originalSharedKata = kata("samsungdang", 42, 0, "shared-1");
  await putRows(factory, [...personal, originalShared], [...personalKata, originalSharedKata]);

  const backup = createBackup(await readBackupV1Data(factory), timestamp);
  assert.deepEqual(backup.data.trainingSession.map((row) => row.sessionNo), [42]);
  assert.deepEqual(backup.data.sessionKata.map((row) => row.kataId), ["shared-1"]);

  const changedShared = { ...originalShared, date: "2026-10-31" };
  await putRows(factory, [changedShared, session("samsungdang", 43, "shared")], [kata("samsungdang", 43, 0, "temporary")]);
  await restoreBackupV1ToIndexedDb(backup, factory);

  const restoredSessions = await all(factory, TRAINING_SESSION_STORE);
  const restoredKata = await all(factory, SESSION_KATA_STORE);
  assert.deepEqual(restoredSessions.filter((row) => row.source === "personal"), personal);
  assert.deepEqual(restoredKata.filter((row) => row.dojo === "__personal__"), personalKata);
  assert.deepEqual(restoredSessions.filter((row) => row.source !== "personal"), [originalShared]);
  assert.deepEqual(restoredKata.filter((row) => row.dojo !== "__personal__"), [originalSharedKata]);
});

test("Backup v1 refuses a shared-record key collision with a personal session without mutating either store", async () => {
  const factory = new IDBFactory();
  const personal = session("__personal__", 5, "personal", "원본 보존");
  const personalKata = kata("__personal__", 5, 0, "personal-kata");
  await putRows(factory, [personal], [personalKata]);
  const beforeSessions = await all(factory, TRAINING_SESSION_STORE);
  const beforeKata = await all(factory, SESSION_KATA_STORE);

  const collidingBackup = createBackup({
    memberProfile: [],
    promotionHistory: [],
    trainingSession: [session("__personal__", 5, "shared")],
    sessionKata: []
  }, timestamp);
  await assert.rejects(restoreBackupV1ToIndexedDb(collidingBackup, factory), {
    code: "personal-session-conflict"
  });
  assert.deepEqual(await all(factory, TRAINING_SESSION_STORE), beforeSessions);
  assert.deepEqual(await all(factory, SESSION_KATA_STORE), beforeKata);
});

test("Backup v1 restore remains compatible when no personal sessions exist", async () => {
  const factory = new IDBFactory();
  const shared = session("samsungdang", 100, "shared");
  const sharedKata = kata("samsungdang", 100, 0, "sh-100");
  await putRows(factory, [shared], [sharedKata]);
  const backup = createBackup(await readBackupV1Data(factory), timestamp);
  await restoreBackupV1ToIndexedDb(backup, factory);
  assert.deepEqual(await all(factory, TRAINING_SESSION_STORE), [shared]);
  assert.deepEqual(await all(factory, SESSION_KATA_STORE), [sharedKata]);
});
