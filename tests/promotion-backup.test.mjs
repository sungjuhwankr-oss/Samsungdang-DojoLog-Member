import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { createBackup } from "../app/backup.mjs";
import { readBackupV1Data, restoreBackupV1ToIndexedDb } from "../app/backup-indexeddb.mjs";
import { encodeCredentialTransportJson } from "../app/credential/credential-verifier.mjs";
import { readStoredMembershipRecord, registerMembershipCredentialToken } from "../app/membership-store.mjs";
import { listVerifiedPromotionHistory, registerPromotionCredentialToken } from "../app/promotion-store.mjs";

const read = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const membershipToken = encodeCredentialTransportJson(await read("membership-test-credential-v1.json"));
const advanceToken = encodeCredentialTransportJson(await read("promotion-advance-one-test-credential-v1.json"));

async function issuedFactory() {
  const factory = new IDBFactory();
  await registerMembershipCredentialToken(membershipToken, { factory });
  await registerPromotionCredentialToken(advanceToken, {
    factory,
    now: () => "2026-09-23T03:00:00.000Z"
  });
  return factory;
}

test("Backup v1 round-trips new Samsungdang provenance and preserves Membership", async () => {
  const factory = await issuedFactory();
  const membershipBefore = await readStoredMembershipRecord(factory);
  const backup = createBackup(await readBackupV1Data(factory), "2026-09-23T04:00:00.000Z");
  assert.equal(backup.version, 1);
  assert.equal(backup.data.promotionHistory[0].source, "samsungdang");
  assert.equal(backup.data.promotionHistory[0].credentialId, "c1_1IgFCdFdzalufBp9LboCgg");
  await restoreBackupV1ToIndexedDb(backup, factory);
  const restored = await listVerifiedPromotionHistory(factory);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].rankValue, 9);
  assert.deepEqual(await readStoredMembershipRecord(factory), membershipBefore);
});

test("restore rejects a tampered Samsungdang envelope before replacing data", async () => {
  const factory = await issuedFactory();
  const before = await readBackupV1Data(factory);
  const backup = createBackup(before, "2026-09-23T04:00:00.000Z");
  const envelope = JSON.parse(backup.data.promotionHistory[0].envelopeJson);
  envelope.signed.payload.examDate = "2026-09-27";
  backup.data.promotionHistory[0].envelopeJson = JSON.stringify(envelope);
  await assert.rejects(restoreBackupV1ToIndexedDb(backup, factory), { code: "invalid-samsungdang-promotion" });
  assert.deepEqual(await readBackupV1Data(factory), before);
});

test("old Backup v1 cannot silently delete a current Samsungdang promotion", async () => {
  const factory = await issuedFactory();
  const oldBackup = createBackup({
    memberProfile: [], promotionHistory: [], trainingSession: [], sessionKata: []
  }, "2026-09-20T00:00:00.000Z");
  await assert.rejects(restoreBackupV1ToIndexedDb(oldBackup, factory), { code: "destructive-promotion-restore" });
  assert.equal((await listVerifiedPromotionHistory(factory)).length, 1);
});
