import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { createBackup } from "../app/backup.mjs";
import { readBackupV1Data, restoreBackupV1ToIndexedDb } from "../app/backup-indexeddb.mjs";
import { openTrainingDatabase } from "../app/training-database.mjs";
import {
  createMemoryJournalRepository,
  listMemoSessions,
  migrateV2Records
} from "../app/training-journal.mjs";
import {
  MEMBER_PROFILE_STORE,
  PERSONAL_SESSION_DOJO,
  PROMOTION_HISTORY_STORE,
  SAMSUNGDANG_MEMBERSHIP_STORE,
  SESSION_KATA_STORE,
  SHARED_SESSION_SNAPSHOT_STORE,
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION,
  TRAINING_SESSION_STORE
} from "../app/training-records.mjs";
import { createTrainingAnalysis } from "../app/training-progress.mjs";

const catalog = JSON.parse(await readFile(new URL("../reference/kata-catalog.v1.json", import.meta.url), "utf8"));
const firstKata = { id: catalog.kata[0].id, name: catalog.kata[0].nameKo };
const secondKata = { id: catalog.kata[1].id, name: catalog.kata[1].nameKo };
const sharedSession = {
  dojo: "samsungdang",
  sessionNo: 1042,
  date: "2026-09-13",
  importedAt: "2026-09-13T10:00:00.000Z",
  sourceSchema: "samsungdang-dojolog-session",
  sourceVersion: 1
};
const sharedKata = [{
  dojo: "samsungdang",
  sessionNo: 1042,
  kataId: firstKata.id,
  kataName: firstKata.name,
  order: 0
}];

function request(requestValue) {
  return new Promise((resolve, reject) => {
    requestValue.onsuccess = () => resolve(requestValue.result);
    requestValue.onerror = () => reject(requestValue.error);
  });
}

function transaction(transactionValue) {
  return new Promise((resolve, reject) => {
    transactionValue.oncomplete = resolve;
    transactionValue.onerror = transactionValue.onabort = () => reject(transactionValue.error);
  });
}

async function createV2Database(factory) {
  const openRequest = factory.open(TRAINING_DB_NAME, 2);
  openRequest.onupgradeneeded = () => {
    const database = openRequest.result;
    database.createObjectStore(TRAINING_SESSION_STORE, { keyPath: ["dojo", "sessionNo"] });
    const kata = database.createObjectStore(SESSION_KATA_STORE, { keyPath: ["dojo", "sessionNo", "order"] });
    kata.createIndex("bySession", ["dojo", "sessionNo"]);
    database.createObjectStore(MEMBER_PROFILE_STORE, { keyPath: "id" });
    const promotions = database.createObjectStore(PROMOTION_HISTORY_STORE, { keyPath: "id" });
    promotions.createIndex("byOrder", "order", { unique: true });
  };
  const database = await request(openRequest);
  const tx = database.transaction([
    TRAINING_SESSION_STORE,
    SESSION_KATA_STORE,
    MEMBER_PROFILE_STORE,
    PROMOTION_HISTORY_STORE
  ], "readwrite");
  tx.objectStore(TRAINING_SESSION_STORE).put(sharedSession);
  tx.objectStore(SESSION_KATA_STORE).put(sharedKata[0]);
  tx.objectStore(MEMBER_PROFILE_STORE).put({ id: "self", name: "성주환", memberNo: null, joinDate: null });
  tx.objectStore(PROMOTION_HISTORY_STORE).put({ id: "p1", rankType: "kyu", rankValue: 8, date: null, order: 1 });
  await transaction(tx);
  database.close();
}

test("정상 v2 DB를 현재 v4로 올리며 기존 4개 store와 record를 보존한다", async () => {
  const factory = new IDBFactory();
  await createV2Database(factory);
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
  const tx = database.transaction([...database.objectStoreNames], "readonly");
  const sessionStore = tx.objectStore(TRAINING_SESSION_STORE);
  const kataStore = tx.objectStore(SESSION_KATA_STORE);
  const snapshotStore = tx.objectStore(SHARED_SESSION_SNAPSHOT_STORE);
  assert.deepEqual(sessionStore.keyPath, ["dojo", "sessionNo"]);
  assert.equal(sessionStore.autoIncrement, false);
  assert.deepEqual(kataStore.keyPath, ["dojo", "sessionNo", "order"]);
  assert.equal(kataStore.autoIncrement, false);
  assert.deepEqual(snapshotStore.keyPath, ["dojo", "sessionNo"]);
  assert.equal(snapshotStore.autoIncrement, false);
  assert.deepEqual([...sessionStore.indexNames], ["byDate", "bySource"]);
  assert.deepEqual([...kataStore.indexNames], ["bySession"]);
  assert.deepEqual([...snapshotStore.indexNames], ["byDate"]);
  const [session, kata, profile, promotion, snapshot] = await Promise.all([
    request(sessionStore.get(["samsungdang", 1042])),
    request(kataStore.getAll()),
    request(tx.objectStore(MEMBER_PROFILE_STORE).get("self")),
    request(tx.objectStore(PROMOTION_HISTORY_STORE).get("p1")),
    request(snapshotStore.get(["samsungdang", 1042]))
  ]);
  await transaction(tx);
  assert.deepEqual(session, { ...sharedSession, source: "shared", note: "" });
  assert.deepEqual(kata, sharedKata);
  assert.equal(profile.name, "성주환");
  assert.equal(promotion.rankValue, 8);
  assert.deepEqual(snapshot.kata, [{ ...firstKata, order: 0 }]);
  database.close();
});

test("v2 migration pure plan은 shared session과 kata를 보존하고 정확한 snapshot을 만든다", () => {
  const result = migrateV2Records([sharedSession], sharedKata);
  assert.deepEqual(result.sessions[0], { ...sharedSession, source: "shared", note: "" });
  assert.deepEqual(result.kataRows, sharedKata);
  assert.deepEqual(result.snapshots[0].kata, [{ ...firstKata, order: 0 }]);
});

test("v2 migration이 중단되면 upgrade transaction이 rollback되어 v2 데이터가 남는다", async () => {
  const factory = new IDBFactory();
  await createV2Database(factory);
  const database = await request(factory.open(TRAINING_DB_NAME, 2));
  const write = database.transaction(TRAINING_SESSION_STORE, "readwrite");
  write.objectStore(TRAINING_SESSION_STORE).put({ ...sharedSession, source: "personal" });
  await transaction(write);
  database.close();
  await assert.rejects(openTrainingDatabase(factory), { name: "AbortError" });
  const preserved = await request(factory.open(TRAINING_DB_NAME, 2));
  assert.equal(preserved.version, 2);
  const read = preserved.transaction(TRAINING_SESSION_STORE, "readonly");
  const session = await request(read.objectStore(TRAINING_SESSION_STORE).get(["samsungdang", 1042]));
  await transaction(read);
  assert.equal(session.date, "2026-09-13");
  assert.equal(session.source, "personal");
  preserved.close();
});

test("개인수련 CRUD, 같은 날짜 복수 session, backfill, zero-kata를 지원한다", async () => {
  const repository = createMemoryJournalRepository();
  const first = await repository.createPersonal({ date: "2026-09-21", note: "오전", kata: [firstKata] }, undefined, 100);
  const second = await repository.createPersonal({ date: "2026-09-21", note: "저녁", kata: [] }, undefined, 100);
  const backfill = await repository.createPersonal({ date: "2025-01-02", note: "과거", kata: [] }, undefined, 100);
  assert.equal(first.dojo, PERSONAL_SESSION_DOJO);
  assert.notEqual(first.sessionNo, second.sessionNo);
  assert.equal((await repository.list()).filter((item) => item.date === "2026-09-21").length, 2);
  assert.equal(second.kata.length, 0);
  assert.equal(backfill.date, "2025-01-02");
  await repository.update(first.dojo, first.sessionNo, { date: "2026-09-20", note: "수정", kata: [secondKata] });
  assert.equal((await repository.list()).find((item) => item.sessionNo === first.sessionNo).note, "수정");
  await repository.removePersonal(second.dojo, second.sessionNo);
  assert.equal((await repository.list()).some((item) => item.sessionNo === second.sessionNo), false);
});

test("shared 편집은 identity와 snapshot을 고정하고 복원 시 memo를 유지한다", async () => {
  const repository = createMemoryJournalRepository({ trainingSession: [sharedSession], sessionKata: sharedKata });
  const before = await repository.getSnapshot("samsungdang", 1042);
  await repository.update("samsungdang", 1042, {
    date: "2026-09-13",
    note: "회원 메모",
    kata: [secondKata]
  });
  const edited = (await repository.list())[0];
  assert.deepEqual(edited.kata.map(({ id }) => id), [secondKata.id]);
  assert.deepEqual(await repository.getSnapshot("samsungdang", 1042), before);
  await assert.rejects(
    repository.update("samsungdang", 1042, { date: "2026-09-14", note: "회원 메모", kata: [] }),
    /identity is immutable/
  );
  const restored = await repository.restore("samsungdang", 1042);
  assert.equal(restored.date, "2026-09-13");
  assert.equal(restored.note, "회원 메모");
  assert.deepEqual(restored.kata.map(({ id }) => id), [firstKata.id]);
  assert.deepEqual(await repository.getSnapshot("samsungdang", 1042), before);
});

test("통계는 snapshot이 아니라 현재 편집 데이터와 session 수를 사용한다", async () => {
  const repository = createMemoryJournalRepository({ trainingSession: [sharedSession], sessionKata: sharedKata });
  await repository.createPersonal({ date: "2026-09-13", note: "", kata: [firstKata] }, undefined, 200);
  await repository.update("samsungdang", 1042, { date: "2026-09-13", note: "", kata: [secondKata] });
  let analysis = createTrainingAnalysis([], await repository.list(), catalog);
  assert.equal(analysis.totalTrainingDays, 1);
  assert.equal(analysis.totalTrainingSessions, 2);
  assert.equal(analysis.exam.all.entries.find((item) => item.id === firstKata.id)?.count ?? 0, 1);
  await repository.restore("samsungdang", 1042);
  analysis = createTrainingAnalysis([], await repository.list(), catalog);
  assert.equal(analysis.exam.all.entries.find((item) => item.id === firstKata.id)?.count ?? 0, 2);
});

test("memo 모아보기는 최신순이며 본문 부분검색과 수정 즉시 반영을 지원한다", async () => {
  const repository = createMemoryJournalRepository({ trainingSession: [sharedSession], sessionKata: sharedKata });
  const older = await repository.createPersonal({ date: "2026-01-01", note: "손목 방향 확인", kata: [] }, undefined, 300);
  await repository.update("samsungdang", 1042, { date: "2026-09-13", note: "중심 이동 연습", kata: [firstKata] });
  let memos = listMemoSessions(await repository.list());
  assert.deepEqual(memos.map((item) => item.date), ["2026-09-13", "2026-01-01"]);
  assert.equal(listMemoSessions(memos, "이동").length, 1);
  await repository.update(older.dojo, older.sessionNo, { date: older.date, note: "발 위치 확인", kata: [] });
  memos = listMemoSessions(await repository.list(), "발 위치");
  assert.equal(memos.length, 1);
  assert.equal(memos[0].sessionNo, older.sessionNo);
});

test("Backup v1은 v4에서 restore되고 shared snapshot을 재구성한다", async () => {
  const factory = new IDBFactory();
  const backup = createBackup({
    memberProfile: [{ id: "self", name: "성주환", memberNo: null, joinDate: null }],
    promotionHistory: [{ id: "p1", rankType: "kyu", rankValue: 8, date: null, order: 1 }],
    trainingSession: [sharedSession],
    sessionKata: sharedKata
  }, "2026-09-21T00:00:00.000Z");
  backup.database.version = 2;
  await restoreBackupV1ToIndexedDb(backup, factory);
  const database = await openTrainingDatabase(factory);
  const tx = database.transaction([
    TRAINING_SESSION_STORE,
    SESSION_KATA_STORE,
    MEMBER_PROFILE_STORE,
    PROMOTION_HISTORY_STORE,
    SHARED_SESSION_SNAPSHOT_STORE
  ], "readonly");
  const [sessions, kata, profiles, promotions, snapshots] = await Promise.all([
    request(tx.objectStore(TRAINING_SESSION_STORE).getAll()),
    request(tx.objectStore(SESSION_KATA_STORE).getAll()),
    request(tx.objectStore(MEMBER_PROFILE_STORE).getAll()),
    request(tx.objectStore(PROMOTION_HISTORY_STORE).getAll()),
    request(tx.objectStore(SHARED_SESSION_SNAPSHOT_STORE).getAll())
  ]);
  await transaction(tx);
  assert.equal(sessions[0].source, "shared");
  assert.equal(sessions[0].note, "");
  assert.deepEqual(kata, sharedKata);
  assert.equal(profiles.length, 1);
  assert.equal(promotions.length, 1);
  assert.deepEqual(snapshots[0].kata, [{ ...firstKata, order: 0 }]);
  database.close();
});

test("잘못된 Backup v1 restore는 기존 DB v4 데이터를 변경하지 않는다", async () => {
  const factory = new IDBFactory();
  const valid = createBackup({
    memberProfile: [], promotionHistory: [], trainingSession: [sharedSession], sessionKata: sharedKata
  }, "2026-09-21T00:00:00.000Z");
  await restoreBackupV1ToIndexedDb(valid, factory);
  const before = await readBackupV1Data(factory);
  await assert.rejects(
    restoreBackupV1ToIndexedDb({ ...valid, schema: "wrong" }, factory),
    { code: "invalid-schema" }
  );
  assert.deepEqual(await readBackupV1Data(factory), before);
});

test("Backup v1 export adapter는 personal, memo, snapshot을 schema v1에 섞지 않는다", async () => {
  const factory = new IDBFactory();
  await restoreBackupV1ToIndexedDb(createBackup({
    memberProfile: [], promotionHistory: [], trainingSession: [sharedSession], sessionKata: sharedKata
  }, "2026-09-21T00:00:00.000Z"), factory);
  const database = await openTrainingDatabase(factory);
  const tx = database.transaction(TRAINING_SESSION_STORE, "readwrite");
  tx.objectStore(TRAINING_SESSION_STORE).put({
    ...sharedSession,
    dojo: PERSONAL_SESSION_DOJO,
    sessionNo: 500,
    source: "personal",
    note: "개인 메모"
  });
  await transaction(tx);
  database.close();
  const data = await readBackupV1Data(factory);
  const result = createBackup(data, "2026-09-21T00:00:00.000Z");
  assert.equal(result.data.trainingSession.length, 1);
  assert.equal("source" in result.data.trainingSession[0], false);
  assert.equal("note" in result.data.trainingSession[0], false);
  assert.deepEqual(Object.keys(result.data).sort(), ["memberProfile", "promotionHistory", "sessionKata", "trainingSession"]);
});

test("DB v4에는 별도 memo store가 없고 UI 검색 결과는 원본 session anchor를 사용한다", async () => {
  assert.equal(TRAINING_DB_VERSION, 4);
  const factory = new IDBFactory();
  const database = await openTrainingDatabase(factory);
  assert.equal(database.objectStoreNames.contains("memo"), false);
  assert.equal(database.objectStoreNames.contains(SAMSUNGDANG_MEMBERSHIP_STORE), true);
  database.close();
  const source = await readFile(new URL("../app/components/training-log.tsx", import.meta.url), "utf8");
  assert.match(source, /listMemoSessions\(records, memoQuery\)/);
  assert.match(source, /href=\{`#\$\{sessionAnchor\(record\)\}`\}/);
  assert.match(source, /record\.note/);
});
