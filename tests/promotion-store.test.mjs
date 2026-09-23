import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

import { encodeUnpaddedBase64Url } from "../app/credential/base64url.mjs";
import { encodeCredentialTransportJson } from "../app/credential/credential-verifier.mjs";
import { deriveCurrentRank } from "../app/member-data.mjs";
import { createMembershipFeatureGate } from "../app/membership-gate.mjs";
import {
  loadStoredMembershipVerification,
  readStoredMembershipRecord,
  registerMembershipCredentialToken
} from "../app/membership-store.mjs";
import {
  listVerifiedPromotionHistory,
  previewPromotionCredentialToken,
  registerPromotionCredentialToken
} from "../app/promotion-store.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "../app/training-database.mjs";
import { PROMOTION_HISTORY_STORE } from "../app/training-records.mjs";

const read = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const membershipJson = await read("membership-test-credential-v1.json");
const advanceJson = await read("promotion-advance-one-test-credential-v1.json");
const targetJson = await read("promotion-target-test-credential-v1.json");
const recognizedJson = await read("promotion-recognized-at-entry-test-credential-v1.json");
const membershipToken = encodeCredentialTransportJson(membershipJson);
const advanceToken = encodeCredentialTransportJson(advanceJson);
const targetToken = encodeCredentialTransportJson(targetJson);
const recognizedToken = encodeCredentialTransportJson(recognizedJson);

async function activateA(factory) {
  await registerMembershipCredentialToken(membershipToken, { factory });
}

async function rawPromotions(factory) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(PROMOTION_HISTORY_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(PROMOTION_HISTORY_STORE).getAll());
    await transactionDone(transaction);
    return records;
  } finally {
    database.close();
  }
}

async function addRawPromotion(factory, record) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(PROMOTION_HISTORY_STORE, "readwrite");
    transaction.objectStore(PROMOTION_HISTORY_STORE).add(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

test("B can verify and preview promotion but has no confirm authority, DB mutation, or A activation", async () => {
  const factory = new IDBFactory();
  const preview = await previewPromotionCredentialToken(advanceToken, { factory });
  assert.equal(preview.verification.valid, true);
  assert.equal(preview.assessment.reason, "membership-required");
  assert.equal(preview.assessment.canConfirm, false);
  assert.deepEqual(preview.assessment.resultRank, { rankType: "kyu", rankValue: 9 });
  assert.equal((await rawPromotions(factory)).length, 0);
  assert.equal(await readStoredMembershipRecord(factory), null);
  assert.equal(createMembershipFeatureGate(await loadStoredMembershipVerification(factory)).hasValidMembershipCredential, false);
  await assert.rejects(registerPromotionCredentialToken(advanceToken, { factory }), { code: "membership-required" });
  assert.equal((await rawPromotions(factory)).length, 0);
});

test("A confirms advance-one atomically from empty history to 9급 with provenance", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const result = await registerPromotionCredentialToken(advanceToken, {
    factory,
    now: () => "2026-09-23T02:00:00.000Z"
  });
  assert.deepEqual(result.assessment.resultRank, { rankType: "kyu", rankValue: 9 });
  assert.deepEqual(result.record, {
    id: "c1_1IgFCdFdzalufBp9LboCgg",
    rankType: "kyu",
    rankValue: 9,
    date: "2026-09-26",
    order: 1,
    source: "samsungdang",
    eventType: "promoted",
    credentialId: "c1_1IgFCdFdzalufBp9LboCgg",
    keyId: "k1_wVLoeV9NYjTi8BqZ-Ktx4-Z7jC1raOTURWSFeum-zfU",
    envelopeJson: JSON.stringify(JSON.parse(advanceJson)),
    registeredAt: "2026-09-23T02:00:00.000Z"
  });
  const restarted = await listVerifiedPromotionHistory(factory);
  assert.equal(deriveCurrentRank(restarted).label, "9급");
  assert.equal(createMembershipFeatureGate(await loadStoredMembershipVerification(factory)).hasValidMembershipCredential, true);
});

test("same credentialId replay and same examDate semantic replay are blocked", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerPromotionCredentialToken(advanceToken, { factory });
  await assert.rejects(registerPromotionCredentialToken(advanceToken, { factory }), { code: "replay" });
  await assert.rejects(registerPromotionCredentialToken(targetToken, { factory }), { code: "exam-date-replay" });
  assert.equal((await rawPromotions(factory)).length, 1);
});

test("target fixture confirms a higher absolute rank and its credentialId replays as replay", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const result = await registerPromotionCredentialToken(targetToken, { factory });
  assert.deepEqual(result.assessment.resultRank, { rankType: "kyu", rankValue: 5 });
  assert.equal(deriveCurrentRank(await listVerifiedPromotionHistory(factory)).label, "5급");
  await assert.rejects(registerPromotionCredentialToken(targetToken, { factory }), { code: "replay" });
});

test("a different later credential succeeds and advances from current state", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  await registerPromotionCredentialToken(advanceToken, { factory });
  const later = JSON.parse(advanceJson);
  later.signed.credentialId = `c1_${encodeUnpaddedBase64Url(Uint8Array.from({ length: 16 }, (_, index) => index + 1))}`;
  later.signed.payload.examDate = "2026-09-27";
  const real = globalThis.crypto.subtle;
  const verifierOptions = { crypto: { subtle: {
    digest: real.digest.bind(real),
    importKey: real.importKey.bind(real),
    verify: async () => true
  } } };
  const result = await registerPromotionCredentialToken(
    encodeCredentialTransportJson(JSON.stringify(later)),
    { factory, verifierOptions }
  );
  assert.deepEqual(result.assessment.resultRank, { rankType: "kyu", rankValue: 8 });
  assert.equal((await rawPromotions(factory)).length, 2);
});

test("recognized-at-entry requires member binding and preserves unknown rankDate", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const result = await registerPromotionCredentialToken(recognizedToken, { factory });
  assert.equal(result.record.eventType, "recognized-at-entry");
  assert.equal(result.record.rankValue, 5);
  assert.equal(result.record.date, null);
  assert.equal(result.record.recognizedAt, "2026-09-26");
  assert.equal(deriveCurrentRank(await listVerifiedPromotionHistory(factory)).date, null);
});

test("recognized-at-entry member mismatch is verified but cannot confirm", async () => {
  const factory = new IDBFactory();
  const other = JSON.parse(membershipJson);
  other.signed.payload.memberId = "ASD-999";
  const real = globalThis.crypto.subtle;
  const verifierOptions = { crypto: { subtle: {
    digest: real.digest.bind(real), importKey: real.importKey.bind(real), verify: async () => true
  } } };
  await registerMembershipCredentialToken(encodeCredentialTransportJson(JSON.stringify(other)), { factory, verifierOptions });
  const preview = await previewPromotionCredentialToken(recognizedToken, { factory, verifierOptions });
  assert.equal(preview.verification.valid, true);
  assert.equal(preview.assessment.reason, "member-mismatch");
  await assert.rejects(registerPromotionCredentialToken(recognizedToken, { factory, verifierOptions }), { code: "member-mismatch" });
  assert.equal((await rawPromotions(factory)).length, 0);
});

test("preview cancellation path is mutation-free and stale preview is rejected at confirm", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const preview = await previewPromotionCredentialToken(targetToken, { factory });
  assert.equal(preview.assessment.canConfirm, true);
  assert.equal((await rawPromotions(factory)).length, 0);
  await addRawPromotion(factory, {
    id: "self-newer", rankType: "kyu", rankValue: 4, date: "2026-09-25", order: 1,
    source: "self", eventType: "self-recorded"
  });
  await assert.rejects(registerPromotionCredentialToken(targetToken, { factory }), { code: "target-conflict" });
  assert.equal((await rawPromotions(factory)).length, 1);
});

test("transaction storage failure rolls back and remains retryable", async () => {
  const factory = new IDBFactory();
  await activateA(factory);
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function add() {
    throw new DOMException("simulated quota failure", "QuotaExceededError");
  };
  try {
    await assert.rejects(registerPromotionCredentialToken(advanceToken, { factory }), { name: "QuotaExceededError" });
  } finally {
    IDBObjectStore.prototype.add = original;
  }
  assert.equal((await rawPromotions(factory)).length, 0);
  assert.equal((await registerPromotionCredentialToken(advanceToken, { factory })).record.rankValue, 9);
});
