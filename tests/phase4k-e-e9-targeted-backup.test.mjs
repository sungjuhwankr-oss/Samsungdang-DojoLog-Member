import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { IDBFactory } from "fake-indexeddb";

import { E3_TARGET_BACKUP_SCHEMA, prepareE3TargetedBackup } from "../app/e3-targeted-backup.mjs";
import { deleteExactE3RecordsWithBackup } from "../app/e3-targeted-cleanup.mjs";
import { openTrainingDatabase } from "../app/training-database.mjs";

const EVENT_ID = "st1_F0YmWz2aUlSE-ssm9nhDZQ";
const CREDENTIAL_ID = "c1_GBR0WQn7hVFqM22mr3tuTQ";
const EVENT_KEY = `samsungdang:${EVENT_ID}`;
const CHANGE_1 = "eh1_2ae6f0ce-d326-438a-8a11-362a81b610a6";
const CHANGE_2 = "eh1_dlBtfg3xrrmMTbSck7Fk2g";
const SESSION_IDS = ["sts1_first", "sts1_second"];

function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedDb({ extraTargetHistory = false, archiveCollision = false, missingMemo = false, unsafeMemo = false } = {}) {
  const factory = new IDBFactory();
  const database = await openTrainingDatabase(factory);
  const stores = Array.from(database.objectStoreNames);
  const transaction = database.transaction(stores, "readwrite");
  const completion = done(transaction);
  const signedEnvelope = JSON.stringify({
    signed: { payload: {
      eventId: EVENT_ID, title: "E3-UX 테스트 전용 특별수련(실제 수련 아님)",
      startDate: "2026-11-01", revision: 1,
      sessions: SESSION_IDS.map(sessionId => ({ sessionId, date: "2026-11-01", label: sessionId }))
    } }, signature: "SECRET-CREDENTIAL-SIGNATURE"
  });
  transaction.objectStore("specialTrainingHistory").add({
    eventId: EVENT_ID, credentialId: CREDENTIAL_ID,
    keyId: "test-key", envelopeJson: signedEnvelope,
    registeredAt: "2026-11-01T05:23:44.127Z"
  });
  transaction.objectStore("specialTrainingHistory").add({
    eventId: "st1_1217Lh5ZfVCODZebWoQ1gA", credentialId: "c1_zpP9kqHDgX_rcSzRBJZDUw",
    envelopeJson: "{}", registeredAt: "2026-09-30T06:37:58.461Z"
  });
  const participation1 = { eventId: EVENT_ID, selectedSessionIds: [SESSION_IDS[0]], updatedAt: "2026-11-01T05:23:44.127Z", revision: 1 };
  const participation2 = { eventId: EVENT_ID, selectedSessionIds: SESSION_IDS, updatedAt: "2026-11-01T05:24:45.182Z", revision: 1 };
  transaction.objectStore("eventParticipation").add(participation2);
  transaction.objectStore("eventChangeHistory").add({
    changeId: CHANGE_1, eventKey: EVENT_KEY, kind: "participation-change",
    before: null, after: participation1, changedAt: "2026-11-01T05:23:44.127Z"
  });
  transaction.objectStore("eventChangeHistory").add({
    changeId: CHANGE_2, eventKey: EVENT_KEY, kind: "participation-change",
    before: participation1, after: participation2, changedAt: "2026-11-01T05:24:45.182Z"
  });
  if (extraTargetHistory) {
    transaction.objectStore("eventChangeHistory").add({
      changeId: "eh1_unexpected", eventKey: EVENT_KEY,
      kind: "participation-change", before: null, after: participation2,
      changedAt: "2026-11-01T05:25:00.000Z"
    });
  }
  for (const [i, kind] of ["external-create", "external-update", "external-delete"].entries()) {
    transaction.objectStore("eventChangeHistory").add({
      changeId: `eh1_external_${i}`, eventKey: "external:xe1_DIGrFfzNEL-j8vD5RqazgQ",
      kind, changedAt: `2026-11-01T05:3${i}:00.000Z`, before: null, after: null
    });
  }
  if (!missingMemo) {
    transaction.objectStore("eventMemo").add({
      eventKey: EVENT_KEY, memo: unsafeMemo ? new Date("2026-11-01T05:32:00Z") : "PRIVATE E3-UX MEMO",
      updatedAt: "2026-11-01T05:33:03.853Z"
    });
  }
  transaction.objectStore("externalEvent").add({
    eventId: "xe1_DIGrFfzNEL-j8vD5RqazgQ", revision: 3,
    deletedAt: "2026-11-01T05:36:45.244Z", title: "preserve test external"
  });
  transaction.objectStore("memberProfile").add({ id: "self", name: "PRESERVE PRIVATE MEMBER" });
  if (archiveCollision) {
    transaction.objectStore("credentialArchive").add({
      credentialId: CREDENTIAL_ID, eventId: EVENT_ID, domain: "special-training", envelopeJson: "secret"
    });
  }
  await completion;
  return { factory, database, stores };
}

async function fullSnapshot(database, stores) {
  const transaction = database.transaction(stores, "readonly");
  const completion = done(transaction);
  const entries = stores.map(store => requestResult(transaction.objectStore(store).getAll()));
  const rows = await Promise.all(entries);
  await completion;
  return Object.fromEntries(stores.map((store, i) => [store, rows[i]]));
}

test("E9 export fails closed without DB; it never creates a database", async () => {
  const factory = new IDBFactory();
  const before = await factory.databases();
  await assert.rejects(prepareE3TargetedBackup(factory), /기존 회원용 DB v6/);
  assert.deepEqual(await factory.databases(), before);
});

test("E9 exports exact five full records, and every store remains byte-equivalent", async () => {
  const { factory, database, stores } = await seedDb();
  const before = await fullSnapshot(database, stores);
  const backup = await prepareE3TargetedBackup(factory, { now: () => "2026-11-01T07:00:00.000Z" });
  const after = await fullSnapshot(database, stores);
  assert.deepEqual(after, before);
  assert.equal(backup.schema, E3_TARGET_BACKUP_SCHEMA);
  assert.equal(backup.databaseVersion, 6);
  assert.deepEqual(backup.target.changeIds, [CHANGE_1, CHANGE_2]);
  assert.deepEqual(Object.fromEntries(Object.entries(backup.records).map(([store, rows]) => [store, rows.length])), {
    specialTrainingHistory: 1, eventParticipation: 1, eventChangeHistory: 2, eventMemo: 1
  });
  assert.equal(backup.records.specialTrainingHistory[0].envelopeJson, before.specialTrainingHistory.find(row => row.eventId === EVENT_ID).envelopeJson);
  assert.equal(backup.records.eventMemo[0].memo, "PRIVATE E3-UX MEMO");
  assert.ok(JSON.stringify(backup).includes("SECRET-CREDENTIAL-SIGNATURE"));
  assert.ok(!JSON.stringify(backup).includes("PRESERVE PRIVATE MEMBER"));
  assert.ok(!JSON.stringify(backup).includes("preserve test external"));
  assert.equal(backup.snapshotCounts.eventChangeHistory, 5);
  assert.equal(backup.snapshotCounts.specialTrainingHistory, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(backup)), backup);
  database.close();
});

for (const [name, config] of [
  ["unexpected third history", { extraTargetHistory: true }],
  ["archived matching credential", { archiveCollision: true }],
  ["missing memo", { missingMemo: true }],
  ["non-string memo", { unsafeMemo: true }]
]) {
  test(`E9 fails closed for ${name}`, async () => {
    const { factory, database, stores } = await seedDb(config);
    const before = await fullSnapshot(database, stores);
    await assert.rejects(prepareE3TargetedBackup(factory), /백업 조건 불일치/);
    assert.deepEqual(await fullSnapshot(database, stores), before);
    database.close();
  });
}

test("E9 backup module remains read-only; deletion is separately gated by UI confirmation", async () => {
  const source = await readFile(new URL("../app/e3-targeted-backup.mjs", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/components/read-only-inventory-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /database\.transaction\(stores, "readonly"\)/);
  assert.doesNotMatch(source, /"readwrite"|objectStore\([^)]*\)\.(?:add|put|delete|clear)\(|fetch\(|sendBeacon|XMLHttpRequest/u);
  assert.match(panel, /E3-UX 시험 기록 5건 백업·정밀 삭제/);
  assert.match(panel, /백업 파일을 별도 위치에 보관했고/);
  assert.match(panel, /window\.confirm\(/);
});

test("E9 exact-five cleanup preserves all other rows and is losslessly restorable in a separate fixture", async () => {
  const { factory, database, stores } = await seedDb();
  const before = await fullSnapshot(database, stores);
  const backup = await prepareE3TargetedBackup(factory);
  const result = await deleteExactE3RecordsWithBackup(backup, factory);
  assert.equal(result.status, "PASS");
  assert.equal(result.deletedCount, 5);
  const after = await fullSnapshot(database, stores);
  assert.equal(after.specialTrainingHistory.length, 1);
  assert.equal(after.eventParticipation.length, 0);
  assert.equal(after.eventChangeHistory.length, 3);
  assert.equal(after.eventMemo.length, 0);
  assert.deepEqual(after.specialTrainingHistory, before.specialTrainingHistory.filter(row => row.eventId !== EVENT_ID));
  assert.deepEqual(after.eventChangeHistory, before.eventChangeHistory.filter(row => row.eventKey !== EVENT_KEY));
  for (const store of stores.filter(name => !["specialTrainingHistory", "eventParticipation", "eventChangeHistory", "eventMemo"].includes(name))) {
    assert.deepEqual(after[store], before[store]);
  }

  // A recovery drill only in fake IndexedDB: restore the five original JSON objects with add(), never overwrite others.
  const restoring = database.transaction(Object.keys(backup.records), "readwrite");
  const complete = done(restoring);
  for (const [store, rows] of Object.entries(backup.records)) {
    for (const row of rows) restoring.objectStore(store).add(structuredClone(row));
  }
  await complete;
  assert.deepEqual(await fullSnapshot(database, stores), before);
  database.close();
});

test("E9 rejects a changed unrelated store without deleting anything", async () => {
  const { factory, database, stores } = await seedDb();
  const backup = await prepareE3TargetedBackup(factory);
  const changing = database.transaction("trainingSession", "readwrite");
  const completed = done(changing);
  changing.objectStore("trainingSession").add({ dojo: "test", sessionNo: 10, source: "test", date: "2026-11-01" });
  await completed;
  const before = await fullSnapshot(database, stores);
  await assert.rejects(deleteExactE3RecordsWithBackup(backup, factory), /기록 수가 백업 이후 변경됨/);
  assert.deepEqual(await fullSnapshot(database, stores), before);
  database.close();
});

test("E9 rejects changed E3 data without deleting or altering any row", async () => {
  const { factory, database, stores } = await seedDb();
  const backup = await prepareE3TargetedBackup(factory);
  const tx = database.transaction("eventMemo", "readwrite");
  const complete = done(tx);
  tx.objectStore("eventMemo").put({ eventKey: EVENT_KEY, memo: "CHANGED AFTER BACKUP", updatedAt: "2026-11-01T05:33:03.853Z" });
  await complete;
  const before = await fullSnapshot(database, stores);
  await assert.rejects(deleteExactE3RecordsWithBackup(backup, factory), /실제 5건의 내용이 백업 원본과 다름/);
  assert.deepEqual(await fullSnapshot(database, stores), before);
  database.close();
});

test("E9 rejects an altered backup document before opening any write transaction", async () => {
  const { factory, database, stores } = await seedDb();
  const backup = await prepareE3TargetedBackup(factory);
  const before = await fullSnapshot(database, stores);
  const tampered = structuredClone(backup);
  tampered.target.credentialId = "c1_malicious";
  await assert.rejects(deleteExactE3RecordsWithBackup(tampered, factory), /백업 문서 구조/);
  assert.deepEqual(await fullSnapshot(database, stores), before);
  database.close();
});

test("E9 fail-closes when same-event history has grown since backup", async () => {
  const { factory, database, stores } = await seedDb();
  const backup = await prepareE3TargetedBackup(factory);
  const tx = database.transaction("eventChangeHistory", "readwrite");
  const complete = done(tx);
  tx.objectStore("eventChangeHistory").add({
    changeId: "eh1_additional_20261101", eventKey: EVENT_KEY,
    kind: "participation-change", changedAt: "2026-11-01T06:00:00Z", before: null, after: null
  });
  await complete;
  const before = await fullSnapshot(database, stores);
  await assert.rejects(deleteExactE3RecordsWithBackup(backup, factory), /기록 수가 백업 이후 변경됨/);
  assert.deepEqual(await fullSnapshot(database, stores), before);
  database.close();
});

test("E9 cleanup source contains exactly five targeted deletes and no bulk clear", async () => {
  const source = await readFile(new URL("../app/e3-targeted-cleanup.mjs", import.meta.url), "utf8");
  assert.match(source, /database\.transaction\(stores, "readwrite"\)/);
  assert.match(source, /TARGET\.changeIds\.map\(id => transaction\.objectStore\("eventChangeHistory"\)\.delete\(id\)\)/);
  assert.doesNotMatch(source, /\.clear\(|deleteDatabase\(|fetch\(|sendBeacon|XMLHttpRequest/u);
});
