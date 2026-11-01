import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { IDBFactory } from "fake-indexeddb";

import { inspectMemberIndexedDb } from "../app/read-only-inventory.mjs";
import { openTrainingDatabase } from "../app/training-database.mjs";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test("read-only inspector does not create a DB when none exists", async () => {
  const factory = new IDBFactory();
  const before = await factory.databases();
  await assert.rejects(inspectMemberIndexedDb(factory), /기존 회원용 DB v6/);
  assert.deepEqual(await factory.databases(), before);
});

test("read-only inspector returns projected IDs and counts without changing any record", async () => {
  const factory = new IDBFactory();
  const database = await openTrainingDatabase(factory);
  const tx = database.transaction([
    "onboardingReceipt", "specialTrainingHistory", "credentialArchive", "eventParticipation"
  ], "readwrite");
  const onboarding = {
    onboardingId: "on1_fixture", credentialId: "c1_onboard", memberId: "ASD-000",
    revision: 1, registeredAt: "2026-11-01T00:00:00Z",
    envelopeJson: '{"secret":"must-not-export"}', name: "Sensitive Test Name"
  };
  const special = {
    eventId: "st1_fixture", credentialId: "c1_special", registeredAt: "2026-11-01T01:00:00Z",
    envelopeJson: JSON.stringify({ signed: { payload: {
      title: "4K test special", startDate: "2026-11-01",
      sessions: [{ sessionId: "s1" }, { sessionId: "s2" }]
    } }, signature: "must-not-export" })
  };
  tx.objectStore("onboardingReceipt").add(onboarding);
  tx.objectStore("specialTrainingHistory").add(special);
  tx.objectStore("credentialArchive").add({ credentialId: "c1_archive", domain: "special-training", eventId: "st1_fixture", archivedAt: "2026-11-01T02:00:00Z" });
  tx.objectStore("eventParticipation").add({ eventId: "st1_fixture", selectedSessionIds: ["s1"], updatedAt: "2026-11-01T03:00:00Z" });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });

  const before = await requestResult(database.transaction("onboardingReceipt", "readonly").objectStore("onboardingReceipt").getAll());
  const result = await inspectMemberIndexedDb(factory);
  const after = await requestResult(database.transaction("onboardingReceipt", "readonly").objectStore("onboardingReceipt").getAll());
  assert.deepEqual(after, before);
  assert.equal(result.readOnly, true);
  assert.equal(result.databaseVersion, 6);
  assert.equal(result.counts.onboardingReceipt, 1);
  assert.equal(result.counts.specialTrainingHistory, 1);
  assert.equal(result.onboarding[0].credentialId, "c1_onboard");
  assert.equal(result.specialTraining[0].credentialVersion, 2);
  assert.equal(result.specialTraining[0].sessionCount, 2);
  assert.equal(result.credentialArchive[0].credentialId, "c1_archive");
  assert.equal(result.eventParticipation[0].sessionCount, 1);
  const text = JSON.stringify(result);
  assert.ok(!text.includes("must-not-export"));
  assert.ok(!text.includes("Sensitive Test Name"));
  database.close();
});

test("unsupported database enumeration stops without opening a database", async () => {
  let opened = false;
  const factory = { open() { opened = true; throw new Error("should not open"); } };
  await assert.rejects(inspectMemberIndexedDb(factory), /DB 목록 조회/);
  assert.equal(opened, false);
});

test("new diagnostics route is included in the offline PWA shell", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /"\.\/diagnostics\/"/);
});
