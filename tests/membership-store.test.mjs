import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

import { createBackup } from "../app/backup.mjs";
import { restoreBackupV1ToIndexedDb } from "../app/backup-indexeddb.mjs";
import { encodeCredentialTransportJson, verifyMembershipCredentialToken } from "../app/credential/membership-verifier.mjs";
import { createMembershipFeatureGate } from "../app/membership-gate.mjs";
import {
  loadStoredMembershipVerification,
  readStoredMembershipRecord,
  registerMembershipCredentialToken
} from "../app/membership-store.mjs";
import { openTrainingDatabase, requestResult, transactionDone, upgradeTrainingDatabase } from "../app/training-database.mjs";
import {
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE,
  SAMSUNGDANG_MEMBERSHIP_STORE,
  SESSION_KATA_STORE,
  SHARED_SESSION_SNAPSHOT_STORE,
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION,
  TRAINING_SESSION_STORE
} from "../app/training-records.mjs";

const credentialJson = await readFile(
  new URL("./fixtures/membership-test-credential-v1.json", import.meta.url),
  "utf8"
);
const credential = JSON.parse(credentialJson);
const token = encodeCredentialTransportJson(credentialJson);

function request(requestValue) {
  return new Promise((resolve, reject) => {
    requestValue.onsuccess = () => resolve(requestValue.result);
    requestValue.onerror = () => reject(requestValue.error);
  });
}

function complete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

async function createV3Database(factory) {
  const open = factory.open(TRAINING_DB_NAME, 3);
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
  };
  const database = await request(open);
  const transaction = database.transaction(
    [
      TRAINING_SESSION_STORE,
      SESSION_KATA_STORE,
      SHARED_SESSION_SNAPSHOT_STORE,
      MEMBER_PROFILE_STORE,
      PROMOTION_HISTORY_STORE
    ],
    "readwrite"
  );
  transaction.objectStore(TRAINING_SESSION_STORE).put({
    dojo: "__personal__",
    sessionNo: 7,
    date: "2026-09-20",
    importedAt: "2026-09-20T10:00:00.000Z",
    sourceSchema: "samsungdang-dojolog-personal-session",
    sourceVersion: 1,
    source: "personal",
    note: "기존 B 기록"
  });
  transaction.objectStore(SESSION_KATA_STORE).put({
    dojo: "__personal__",
    sessionNo: 7,
    kataId: "개인-카타",
    kataName: "개인 카타",
    order: 0
  });
  transaction.objectStore(TRAINING_SESSION_STORE).put({
    dojo: "samsungdang",
    sessionNo: 1042,
    date: "2026-09-13",
    importedAt: "2026-09-13T10:00:00.000Z",
    sourceSchema: "samsungdang-dojolog-session",
    sourceVersion: 1,
    source: "shared",
    note: "공유수업 메모"
  });
  transaction.objectStore(SESSION_KATA_STORE).put({
    dojo: "samsungdang",
    sessionNo: 1042,
    kataId: "공유-카타",
    kataName: "공유 카타",
    order: 0
  });
  transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE).put({
    dojo: "samsungdang",
    sessionNo: 1042,
    date: "2026-09-13",
    importedAt: "2026-09-13T10:00:00.000Z",
    sourceSchema: "samsungdang-dojolog-session",
    sourceVersion: 1,
    kata: [{ id: "공유-카타", name: "공유 카타", order: 0 }]
  });
  transaction.objectStore(MEMBER_PROFILE_STORE).put({ id: "self", name: "기존 사용자", memberNo: null, joinDate: null });
  transaction.objectStore(PROMOTION_HISTORY_STORE).put({ id: "p1", rankType: "kyu", rankValue: 8, date: "2026-01-01", order: 1 });
  await complete(transaction);
  database.close();
}

test("v3 → v4 migration adds only samsungdangMembership and preserves every existing record", async () => {
  const factory = new IDBFactory();
  await createV3Database(factory);
  const database = await openTrainingDatabase(factory);
  assert.equal(database.version, 4);
  assert.deepEqual([...database.objectStoreNames], [
    "memberProfile",
    "promotionHistory",
    "samsungdangMembership",
    "sessionKata",
    "sharedSessionSnapshot",
    "trainingSession"
  ]);
  const transaction = database.transaction(
    [
      TRAINING_SESSION_STORE,
      SESSION_KATA_STORE,
      SHARED_SESSION_SNAPSHOT_STORE,
      MEMBER_PROFILE_STORE,
      PROMOTION_HISTORY_STORE,
      SAMSUNGDANG_MEMBERSHIP_STORE
    ],
    "readonly"
  );
  assert.equal((await requestResult(transaction.objectStore(TRAINING_SESSION_STORE).get(["__personal__", 7]))).note, "기존 B 기록");
  assert.equal((await requestResult(transaction.objectStore(SESSION_KATA_STORE).count())), 2);
  assert.equal((await requestResult(transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE).count())), 1);
  assert.equal((await requestResult(transaction.objectStore(MEMBER_PROFILE_STORE).get("self"))).name, "기존 사용자");
  assert.equal((await requestResult(transaction.objectStore(PROMOTION_HISTORY_STORE).get("p1"))).rankValue, 8);
  assert.equal(await requestResult(transaction.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE).count()), 0);
  await transactionDone(transaction);
  database.close();
});

test("v3 → v4 upgrade transaction abort rolls back the new store and preserves v3 data", async () => {
  const factory = new IDBFactory();
  await createV3Database(factory);
  const open = factory.open(TRAINING_DB_NAME, 4);
  open.onupgradeneeded = (event) => {
    upgradeTrainingDatabase(open, event.oldVersion);
    open.transaction.abort();
  };
  await assert.rejects(request(open), { name: "AbortError" });
  const preserved = await request(factory.open(TRAINING_DB_NAME, 3));
  assert.equal(preserved.version, 3);
  assert.equal(preserved.objectStoreNames.contains(SAMSUNGDANG_MEMBERSHIP_STORE), false);
  const transaction = preserved.transaction(TRAINING_SESSION_STORE, "readonly");
  assert.equal((await request(transaction.objectStore(TRAINING_SESSION_STORE).get(["__personal__", 7]))).note, "기존 B 기록");
  await complete(transaction);
  preserved.close();
});

test("verification preview and cancellation path do not write membership data", async () => {
  const factory = new IDBFactory();
  assert.equal((await verifyMembershipCredentialToken(token)).valid, true);
  assert.equal(await readStoredMembershipRecord(factory), null);
});

test("confirm atomically stores the original envelope and derives A after app restart", async () => {
  const factory = new IDBFactory();
  const verification = await registerMembershipCredentialToken(token, {
    factory,
    now: () => "2026-09-21T10:00:00.000Z"
  });
  assert.equal(verification.valid, true);
  const record = await readStoredMembershipRecord(factory);
  assert.deepEqual(record, {
    id: "current",
    credentialId: credential.signed.credentialId,
    keyId: credential.signed.keyId,
    envelopeJson: credentialJson,
    registeredAt: "2026-09-21T10:00:00.000Z"
  });
  const reloaded = await loadStoredMembershipVerification(factory);
  assert.equal(reloaded.valid, true);
  assert.equal(createMembershipFeatureGate(reloaded).hasValidMembershipCredential, true);
});

test("registration preserves existing B sessions, profile, promotions, and snapshots", async () => {
  const factory = new IDBFactory();
  await createV3Database(factory);
  await registerMembershipCredentialToken(token, { factory });
  const database = await openTrainingDatabase(factory);
  const transaction = database.transaction(
    [TRAINING_SESSION_STORE, SESSION_KATA_STORE, SHARED_SESSION_SNAPSHOT_STORE, MEMBER_PROFILE_STORE, PROMOTION_HISTORY_STORE],
    "readonly"
  );
  assert.equal((await requestResult(transaction.objectStore(TRAINING_SESSION_STORE).count())), 2);
  assert.equal((await requestResult(transaction.objectStore(SESSION_KATA_STORE).count())), 2);
  assert.equal((await requestResult(transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE).count())), 1);
  assert.equal((await requestResult(transaction.objectStore(MEMBER_PROFILE_STORE).count())), 1);
  assert.equal((await requestResult(transaction.objectStore(PROMOTION_HISTORY_STORE).count())), 1);
  await transactionDone(transaction);
  database.close();
});

test("same credentialId replay is blocked without changing the stored record", async () => {
  const factory = new IDBFactory();
  await registerMembershipCredentialToken(token, { factory, now: () => "2026-09-21T10:00:00.000Z" });
  const before = await readStoredMembershipRecord(factory);
  await assert.rejects(registerMembershipCredentialToken(token, { factory }), { code: "replay" });
  assert.deepEqual(await readStoredMembershipRecord(factory), before);
});

test("an existing different credential is never silently overwritten", async () => {
  const factory = new IDBFactory();
  const database = await openTrainingDatabase(factory);
  const transaction = database.transaction(SAMSUNGDANG_MEMBERSHIP_STORE, "readwrite");
  transaction.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE).add({
    id: "current",
    credentialId: "c1_existing-different-id",
    keyId: "k1_existing",
    envelopeJson: "{}",
    registeredAt: "2026-09-20T00:00:00.000Z"
  });
  await transactionDone(transaction);
  database.close();
  const before = await readStoredMembershipRecord(factory);
  await assert.rejects(registerMembershipCredentialToken(token, { factory }), { code: "existing-membership" });
  assert.deepEqual(await readStoredMembershipRecord(factory), before);
});

test("invalid credential and arbitrary boolean cannot activate A", async () => {
  const factory = new IDBFactory();
  const tampered = structuredClone(credential);
  tampered.signed.payload.name = "변조";
  await assert.rejects(
    registerMembershipCredentialToken(encodeCredentialTransportJson(JSON.stringify(tampered)), { factory }),
    { code: "invalid-credential" }
  );
  assert.equal(await readStoredMembershipRecord(factory), null);
  assert.equal(createMembershipFeatureGate({ valid: true }).hasValidMembershipCredential, false);
});

test("storage failure leaves A inactive and no partial membership record", async () => {
  const factory = new IDBFactory();
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function add() {
    throw new DOMException("simulated storage failure", "QuotaExceededError");
  };
  try {
    await assert.rejects(registerMembershipCredentialToken(token, { factory }), { name: "QuotaExceededError" });
  } finally {
    IDBObjectStore.prototype.add = original;
  }
  assert.equal(await readStoredMembershipRecord(factory), null);
  assert.equal(createMembershipFeatureGate(await loadStoredMembershipVerification(factory)).hasValidMembershipCredential, false);
});

test("Backup v1 restore replaces only v1 stores and preserves Membership Credential", async () => {
  const factory = new IDBFactory();
  await registerMembershipCredentialToken(token, { factory });
  const before = await readStoredMembershipRecord(factory);
  const backup = createBackup({
    memberProfile: [{ id: "self", name: "복원", memberNo: null, joinDate: null }],
    promotionHistory: [],
    trainingSession: [],
    sessionKata: []
  }, "2026-09-21T11:00:00.000Z");
  await restoreBackupV1ToIndexedDb(backup, factory);
  assert.deepEqual(await readStoredMembershipRecord(factory), before);
  assert.equal((await loadStoredMembershipVerification(factory)).valid, true);
});

test("Backup v1 validation failure preserves both legacy data and Membership Credential", async () => {
  const factory = new IDBFactory();
  await registerMembershipCredentialToken(token, { factory });
  const before = await readStoredMembershipRecord(factory);
  await assert.rejects(restoreBackupV1ToIndexedDb({ schema: "wrong" }, factory), { code: "invalid-schema" });
  assert.deepEqual(await readStoredMembershipRecord(factory), before);
});

test("Phase 4H-B physical schema uses DB v4 and one dedicated membership store", () => {
  assert.equal(TRAINING_DB_VERSION, 4);
  assert.equal(SAMSUNGDANG_MEMBERSHIP_STORE, "samsungdangMembership");
});
