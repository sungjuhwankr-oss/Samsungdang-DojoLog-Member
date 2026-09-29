import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

import { createBackup } from "../app/backup.mjs";
import { readBackupV1Data, restoreBackupV1ToIndexedDb } from "../app/backup-indexeddb.mjs";
import { encodeCredentialTransportJson } from "../app/credential/credential-verifier.mjs";
import { createMembershipFeatureGate } from "../app/membership-gate.mjs";
import {
  loadStoredMembershipVerification,
  readStoredMembershipRecord,
  registerMembershipCredentialToken
} from "../app/membership-store.mjs";
import {
  listVerifiedSpecialTrainingHistory,
  previewSpecialTrainingCredentialToken,
  registerSpecialTrainingCredentialToken
} from "../app/special-training-store.mjs";
import { openTrainingDatabase, requestResult, transactionDone, upgradeTrainingDatabase } from "../app/training-database.mjs";
import {
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE,
  SAMSUNGDANG_MEMBERSHIP_STORE,
  SESSION_KATA_STORE,
  SHARED_SESSION_SNAPSHOT_STORE,
  SPECIAL_TRAINING_HISTORY_STORE,
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION,
  TRAINING_SESSION_STORE
} from "../app/training-records.mjs";

const read = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const membershipJson = await read("membership-test-credential-v1.json");
const a1Json = await read("special-training-A1-test-credential-v1.json");
const a2Json = await read("special-training-A2-same-event-test-credential-v1.json");
const b1Json = await read("special-training-B1-same-date-different-event-test-credential-v1.json");
const membershipToken = encodeCredentialTransportJson(membershipJson);
const a1Token = encodeCredentialTransportJson(a1Json);
const a2Token = encodeCredentialTransportJson(a2Json);
const b1Token = encodeCredentialTransportJson(b1Json);

const request = (value) => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});
const complete = (value) => new Promise((resolve, reject) => {
  value.oncomplete = resolve;
  value.onerror = value.onabort = () => reject(value.error);
});

async function activateA(factory) {
  await registerMembershipCredentialToken(membershipToken, { factory });
}

async function rawSpecialHistory(factory) {
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

function acceptingCrypto() {
  const subtle = globalThis.crypto.subtle;
  return { subtle: {
    digest: subtle.digest.bind(subtle),
    importKey: subtle.importKey.bind(subtle),
    verify: async () => true
  } };
}

test("B previews verified content but cannot confirm, mutate history, or become A", async () => {
  const factory = new IDBFactory();
  const preview = await previewSpecialTrainingCredentialToken(a1Token, { factory });
  assert.equal(preview.verification.valid, true);
  assert.equal(preview.assessment.canConfirm, false);
  assert.equal(preview.assessment.reason, "membership-required");
  assert.equal((await rawSpecialHistory(factory)).length, 0);
  assert.equal(await readStoredMembershipRecord(factory), null);
  assert.equal(createMembershipFeatureGate(await loadStoredMembershipVerification(factory)).hasValidMembershipCredential, false);
  await assert.rejects(registerSpecialTrainingCredentialToken(a1Token, { factory }), { code: "membership-required" });
  assert.equal((await rawSpecialHistory(factory)).length, 0);
});

test("A confirms atomically and read-time verification derives the history view after restart", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const result = await registerSpecialTrainingCredentialToken(a1Token, {
    factory,
    now: () => "2026-09-29T06:00:00.000Z"
  });
  assert.deepEqual(result.record, {
    eventId: "st1_1217Lh5ZfVCODZebWoQ1gA",
    credentialId: "c1_zpP9kqHDgX_rcSzRBJZDUw",
    keyId: "k1_wVLoeV9NYjTi8BqZ-Ktx4-Z7jC1raOTURWSFeum-zfU",
    envelopeJson: JSON.stringify(JSON.parse(a1Json)),
    registeredAt: "2026-09-29T06:00:00.000Z"
  });
  const [view] = await listVerifiedSpecialTrainingHistory(factory);
  assert.equal(view.title, "Phase 4J 테스트 특별수련");
  assert.equal(view.startDate, "2026-09-29");
  assert.equal(view.instructor, "테스트 지도자");
});

test("credential replay and same-event new-credential replay are distinguished", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerSpecialTrainingCredentialToken(a1Token, { factory });
  await assert.rejects(registerSpecialTrainingCredentialToken(a1Token, { factory }), { code: "credential-replay" });
  await assert.rejects(registerSpecialTrainingCredentialToken(a2Token, { factory }), { code: "event-replay" });
  assert.equal((await rawSpecialHistory(factory)).length, 1);
});

test("same date with a different eventId is allowed and sorted deterministically", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerSpecialTrainingCredentialToken(a1Token, { factory });
  await registerSpecialTrainingCredentialToken(b1Token, { factory });
  const history = await listVerifiedSpecialTrainingHistory(factory);
  assert.equal(history.length, 2);
  assert.deepEqual(new Set(history.map((item) => item.eventId)), new Set([
    "st1_1217Lh5ZfVCODZebWoQ1gA",
    "st1_-6ZU8ka2PqqIdSJ5m9M_Zw"
  ]));
});

test("same eventId with different signed event details is an event conflict", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerSpecialTrainingCredentialToken(a1Token, { factory });
  const conflicting = JSON.parse(a2Json);
  conflicting.signed.payload.title = "서로 다른 행사 내용";
  await assert.rejects(
    registerSpecialTrainingCredentialToken(encodeCredentialTransportJson(JSON.stringify(conflicting)), {
      factory,
      verifierOptions: { crypto: acceptingCrypto() }
    }),
    { code: "event-conflict" }
  );
  assert.equal((await rawSpecialHistory(factory)).length, 1);
});

test("preview and cancel path are mutation-free, and stale preview is rechecked at confirm", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const preview = await previewSpecialTrainingCredentialToken(a2Token, { factory });
  assert.equal(preview.assessment.canConfirm, true);
  assert.equal((await rawSpecialHistory(factory)).length, 0);
  await registerSpecialTrainingCredentialToken(a1Token, { factory });
  await assert.rejects(registerSpecialTrainingCredentialToken(a2Token, { factory }), { code: "event-replay" });
  assert.equal((await rawSpecialHistory(factory)).length, 1);
});

test("transaction storage failure rolls back with zero partial records and remains retryable", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function add() {
    throw new DOMException("simulated quota failure", "QuotaExceededError");
  };
  try {
    await assert.rejects(registerSpecialTrainingCredentialToken(a1Token, { factory }), { name: "QuotaExceededError" });
  } finally {
    IDBObjectStore.prototype.add = original;
  }
  assert.equal((await rawSpecialHistory(factory)).length, 0);
  assert.equal((await registerSpecialTrainingCredentialToken(a1Token, { factory })).record.eventId, "st1_1217Lh5ZfVCODZebWoQ1gA");
});

test("tampered stored envelope fails closed at read time", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerSpecialTrainingCredentialToken(a1Token, { factory });
  const database = await openTrainingDatabase(factory);
  const transaction = database.transaction(SPECIAL_TRAINING_HISTORY_STORE, "readwrite");
  const store = transaction.objectStore(SPECIAL_TRAINING_HISTORY_STORE);
  const record = await requestResult(store.get("st1_1217Lh5ZfVCODZebWoQ1gA"));
  const envelope = JSON.parse(record.envelopeJson);
  envelope.signed.payload.title = "변조";
  store.put({ ...record, envelopeJson: JSON.stringify(envelope) });
  await transactionDone(transaction);
  database.close();
  await assert.rejects(listVerifiedSpecialTrainingHistory(factory), /invalid-samsungdang-special-training/);
});

test("one public credential registers independently in separate A storage areas", async () => {
  const first = new IDBFactory();
  const second = new IDBFactory();
  await Promise.all([activateA(first), activateA(second)]);
  await Promise.all([
    registerSpecialTrainingCredentialToken(a1Token, { factory: first }),
    registerSpecialTrainingCredentialToken(a1Token, { factory: second })
  ]);
  assert.equal((await rawSpecialHistory(first)).length, 1);
  assert.equal((await rawSpecialHistory(second)).length, 1);
});

test("special registration does not create a trainingSession or alter training statistics inputs", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerSpecialTrainingCredentialToken(a1Token, { factory });
  const database = await openTrainingDatabase(factory);
  const transaction = database.transaction([TRAINING_SESSION_STORE, SESSION_KATA_STORE], "readonly");
  assert.equal(await requestResult(transaction.objectStore(TRAINING_SESSION_STORE).count()), 0);
  assert.equal(await requestResult(transaction.objectStore(SESSION_KATA_STORE).count()), 0);
  await transactionDone(transaction);
  database.close();
});

test("Backup v1 export excludes special history and new/old restore preserve it byte-for-byte", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerSpecialTrainingCredentialToken(a1Token, { factory });
  const before = await rawSpecialHistory(factory);
  const data = await readBackupV1Data(factory);
  const fresh = createBackup(data, "2026-09-29T07:00:00.000Z");
  assert.deepEqual(Object.keys(fresh.data).sort(), ["memberProfile", "promotionHistory", "sessionKata", "trainingSession"]);
  await restoreBackupV1ToIndexedDb(fresh, factory);
  assert.deepEqual(await rawSpecialHistory(factory), before);
  const old = structuredClone(fresh);
  old.database.version = 2;
  await restoreBackupV1ToIndexedDb(old, factory);
  assert.deepEqual(await rawSpecialHistory(factory), before);
});

async function createV4Database(factory) {
  const open = factory.open(TRAINING_DB_NAME, 4);
  open.onupgradeneeded = () => {
    const database = open.result;
    const sessions = database.createObjectStore(TRAINING_SESSION_STORE, { keyPath: ["dojo", "sessionNo"] });
    sessions.createIndex("byDate", "date");
    sessions.createIndex("bySource", "source");
    const kata = database.createObjectStore(SESSION_KATA_STORE, { keyPath: ["dojo", "sessionNo", "order"] });
    kata.createIndex("bySession", ["dojo", "sessionNo"]);
    database.createObjectStore(MEMBER_PROFILE_STORE, { keyPath: "id" });
    const promotions = database.createObjectStore(PROMOTION_HISTORY_STORE, { keyPath: "id" });
    promotions.createIndex("byOrder", "order", { unique: true });
    const snapshots = database.createObjectStore(SHARED_SESSION_SNAPSHOT_STORE, { keyPath: ["dojo", "sessionNo"] });
    snapshots.createIndex("byDate", "date");
    database.createObjectStore(SAMSUNGDANG_MEMBERSHIP_STORE, { keyPath: "id" });
  };
  const database = await request(open);
  const transaction = database.transaction([...database.objectStoreNames], "readwrite");
  transaction.objectStore(TRAINING_SESSION_STORE).put({
    dojo: "__personal__", sessionNo: 1, date: "2026-09-28", importedAt: "2026-09-28T00:00:00.000Z",
    sourceSchema: "samsungdang-dojolog-personal-session", sourceVersion: 1, source: "personal", note: "보존"
  });
  transaction.objectStore(MEMBER_PROFILE_STORE).put({ id: "self", name: "기존 A", memberNo: null, joinDate: null });
  transaction.objectStore(PROMOTION_HISTORY_STORE).put({ id: "p1", rankType: "kyu", rankValue: 8, date: "2026-01-01", order: 1 });
  const membership = JSON.parse(membershipJson);
  transaction.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE).put({
    id: "current", credentialId: membership.signed.credentialId, keyId: membership.signed.keyId,
    envelopeJson: membershipJson, registeredAt: "2026-09-21T00:00:00.000Z"
  });
  await complete(transaction);
  database.close();
}

test("new install and v4→v5 create the exact special store/index while preserving all v4 data", async () => {
  assert.equal(TRAINING_DB_VERSION, 5);
  const fresh = await openTrainingDatabase(new IDBFactory());
  const freshStore = fresh.transaction(SPECIAL_TRAINING_HISTORY_STORE, "readonly").objectStore(SPECIAL_TRAINING_HISTORY_STORE);
  assert.equal(freshStore.keyPath, "eventId");
  assert.equal(freshStore.autoIncrement, false);
  assert.deepEqual([...freshStore.indexNames], ["byCredentialId"]);
  assert.equal(freshStore.index("byCredentialId").keyPath, "credentialId");
  assert.equal(freshStore.index("byCredentialId").unique, true);
  fresh.close();

  const factory = new IDBFactory();
  await createV4Database(factory);
  const database = await openTrainingDatabase(factory);
  assert.equal(database.version, 5);
  assert.equal(database.objectStoreNames.length, 7);
  const transaction = database.transaction([...database.objectStoreNames], "readonly");
  assert.equal((await requestResult(transaction.objectStore(TRAINING_SESSION_STORE).get(["__personal__", 1]))).note, "보존");
  assert.equal((await requestResult(transaction.objectStore(MEMBER_PROFILE_STORE).get("self"))).name, "기존 A");
  assert.equal((await requestResult(transaction.objectStore(PROMOTION_HISTORY_STORE).get("p1"))).rankValue, 8);
  assert.equal((await requestResult(transaction.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE).get("current"))).credentialId, JSON.parse(membershipJson).signed.credentialId);
  assert.equal(await requestResult(transaction.objectStore(SPECIAL_TRAINING_HISTORY_STORE).count()), 0);
  await transactionDone(transaction);
  database.close();
});

test("v4→v5 migration abort rolls back the version change and preserves v4 records", async () => {
  const factory = new IDBFactory();
  await createV4Database(factory);
  const open = factory.open(TRAINING_DB_NAME, 5);
  open.onupgradeneeded = (event) => {
    upgradeTrainingDatabase(open, event.oldVersion);
    open.transaction.abort();
  };
  await assert.rejects(request(open), { name: "AbortError" });
  const preserved = await request(factory.open(TRAINING_DB_NAME, 4));
  assert.equal(preserved.objectStoreNames.contains(SPECIAL_TRAINING_HISTORY_STORE), false);
  const transaction = preserved.transaction(TRAINING_SESSION_STORE, "readonly");
  assert.equal((await request(transaction.objectStore(TRAINING_SESSION_STORE).get(["__personal__", 1]))).note, "보존");
  await complete(transaction);
  preserved.close();
});
