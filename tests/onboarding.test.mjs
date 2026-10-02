import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";
import { canonicalize } from "json-canonicalize";

import { createBackup } from "../app/backup.mjs";
import { readBackupV1Data, restoreBackupV1ToIndexedDb } from "../app/backup-indexeddb.mjs";
import { encodeUnpaddedBase64Url } from "../app/credential/base64url.mjs";
import {
  CREDENTIAL_REASON,
  calculateKeyIdFromSpki
} from "../app/credential/credential-verifier.mjs";
import {
  ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT,
  decodeOnboardingTransportToken,
  verifyMemberOnboardingToken
} from "../app/credential/onboarding-verifier.mjs";
import { deriveCurrentRankWithOnboarding } from "../app/member-data.mjs";
import { loadStoredMembershipVerification } from "../app/membership-store.mjs";
import {
  loadActiveOnboardingState,
  previewMemberOnboardingToken,
  registerMemberOnboardingToken,
  updateProgressBaseline
} from "../app/onboarding-store.mjs";
import { openTrainingDatabase } from "../app/training-database.mjs";
import { createTrainingAnalysis } from "../app/training-progress.mjs";
import * as stores from "../app/training-records.mjs";

const catalog = JSON.parse(await readFile(new URL("../reference/kata-catalog.v2.json", import.meta.url), "utf8"));
const b64id = (prefix, byte) => `${prefix}${encodeUnpaddedBase64Url(new Uint8Array(16).fill(byte))}`;

function request(value) {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function transaction(value) {
  return new Promise((resolve, reject) => {
    value.oncomplete = resolve;
    value.onerror = value.onabort = () => reject(value.error);
  });
}

async function cryptoFixture() {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const keyId = await calculateKeyIdFromSpki(spki);
  return {
    keyPair, keyId,
    registry: { [keyId]: { keyId, publicKeySpkiBase64Url: encodeUnpaddedBase64Url(spki), status: "active" } }
  };
}

function payload(overrides = {}) {
  const first = { entryId: b64id("or1_", 1), rankType: "kyu", rankValue: 9, rankDate: "2020-01-01" };
  const current = { entryId: b64id("or1_", 2), rankType: "kyu", rankValue: 8, rankDate: null };
  return {
    onboardingId: b64id("on1_", 3), revision: 1, supersedesCredentialId: null,
    recognizedAt: "2026-10-02",
    membership: { name: "테스트회원", memberId: "ASD-000", joinedAt: "2015-12-06" },
    recognizedRanks: [first, current], currentRankEntryId: current.entryId,
    baselineAsOf: "2026-10-02", currentRankSessionBaseline: 0,
    kataBaselines: [
      { kataId: catalog.kata[0].id, count: 0 },
      { kataId: catalog.kata[1].id, count: null }
    ],
    ...overrides
  };
}

async function credential(fixture, payloadValue, credentialByte = 4) {
  const signed = {
    schema: "samsungdang-dojolog-credential", credentialVersion: 1,
    issuer: "aikido-samsungdang", type: "member-onboarding",
    credentialId: b64id("c1_", credentialByte), keyId: fixture.keyId,
    issuedAt: "2026-10-02T06:00:00Z", payload: payloadValue
  };
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, fixture.keyPair.privateKey,
    new TextEncoder().encode(canonicalize(signed))
  ));
  return { signed, signature: encodeUnpaddedBase64Url(signature) };
}

async function tokenFor(envelope, compressed = true) {
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  if (!compressed) return encodeUnpaddedBase64Url(bytes);
  const gzip = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  return `gz1.${encodeUnpaddedBase64Url(gzip)}`;
}

test("raw and gz1 onboarding transport verify; malformed, tamper, trailing, and hard-limit input fail closed", async () => {
  const fixture = await cryptoFixture();
  const envelope = await credential(fixture, payload());
  for (const compressed of [false, true]) {
    const token = await tokenFor(envelope, compressed);
    const verified = await verifyMemberOnboardingToken(token, { registry: fixture.registry });
    assert.equal(verified.valid, true);
  }
  const gz = await tokenFor(envelope);
  assert.equal((await verifyMemberOnboardingToken(gz.slice(0, -1) + "!", { registry: fixture.registry })).reason, CREDENTIAL_REASON.INVALID_ENCODING);
  const tampered = structuredClone(envelope);
  tampered.signed.payload.membership.name = "변조";
  assert.equal((await verifyMemberOnboardingToken(await tokenFor(tampered), { registry: fixture.registry })).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
  const gzipBytes = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(JSON.stringify(envelope))]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  const trailing = new Uint8Array(gzipBytes.length + 1); trailing.set(gzipBytes); trailing[trailing.length - 1] = 0;
  await assert.rejects(decodeOnboardingTransportToken(`gz1.${encodeUnpaddedBase64Url(trailing)}`));
  const bombSource = new TextEncoder().encode("A".repeat(128 * 1024 + 1));
  const bomb = new Uint8Array(await new Response(new Blob([bombSource]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  await assert.rejects(decodeOnboardingTransportToken(`gz1.${encodeUnpaddedBase64Url(bomb)}`), /128 KiB/);
  assert.equal((await verifyMemberOnboardingToken("gz1." + "A".repeat(ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT))).valid, false);
});

test("preview is mutation-free; confirm is atomic and keeps 0, unknown, and unset distinct", async () => {
  const fixture = await cryptoFixture();
  const envelope = await credential(fixture, payload());
  const token = await tokenFor(envelope);
  const factory = new IDBFactory();
  const preview = await previewMemberOnboardingToken(token, { factory, verifierOptions: { registry: fixture.registry } });
  assert.equal(preview.assessment.reason, "new");
  assert.equal(await loadActiveOnboardingState(factory, { registry: fixture.registry }), null);
  await registerMemberOnboardingToken(token, { factory, verifierOptions: { registry: fixture.registry }, now: () => "2026-10-02T06:01:00.000Z" });
  const state = await loadActiveOnboardingState(factory, { registry: fixture.registry });
  assert.equal(state.receipt.memberId, "ASD-000");
  const membership = await loadStoredMembershipVerification(factory, { registry: fixture.registry });
  assert.equal(membership.valid, true);
  assert.deepEqual(membership.verifiedPayload, envelope.signed.payload.membership);
  assert.equal(state.ranks.length, 2);
  assert.equal(state.baselines.find(row => row.subjectId === envelope.signed.payload.currentRankEntryId).value, 0);
  assert.equal(state.baselines.find(row => row.subjectId === catalog.kata[1].id).value, null);
  assert.equal(state.baselines.some(row => row.subjectId === catalog.kata[2].id), false);
  const database = await openTrainingDatabase(factory);
  const historyTx = database.transaction(stores.BASELINE_CHANGE_HISTORY_STORE, "readonly");
  const history = await request(historyTx.objectStore(stores.BASELINE_CHANGE_HISTORY_STORE).getAll());
  await transaction(historyTx); database.close();
  assert.equal(history.length, 3);
  assert.deepEqual(history.map(row => [row.actor, row.before, row.after]), [
    ["instructor", { state: "unset" }, { state: "known", value: 0 }],
    ["instructor", { state: "unset" }, { state: "known", value: 0 }],
    ["instructor", { state: "unset" }, { state: "unknown" }]
  ]);
});

test("confirm storage failure rolls back receipt, rank, archive, and all new baseline rows", async () => {
  const fixture = await cryptoFixture();
  const value = payload();
  const envelope = await credential(fixture, value, 12);
  const factory = new IDBFactory();
  const database = await openTrainingDatabase(factory);
  const seed = database.transaction(stores.PROGRESS_BASELINE_STORE, "readwrite");
  seed.objectStore(stores.PROGRESS_BASELINE_STORE).add({
    baselineId: "existing", kind: "current-rank-session", subjectId: value.currentRankEntryId,
    value: 3, provenance: "self-recorded", originCredentialId: "old", baselineAsOf: "2026-01-01", updatedAt: "2026-01-01T00:00:00Z", revision: 1
  });
  await transaction(seed); database.close();
  await assert.rejects(registerMemberOnboardingToken(await tokenFor(envelope), {
    factory, verifierOptions: { registry: fixture.registry }
  }));
  const check = await openTrainingDatabase(factory);
  const tx = check.transaction([stores.ONBOARDING_RECEIPT_STORE, stores.ONBOARDING_RANK_HISTORY_STORE, stores.CREDENTIAL_ARCHIVE_STORE, stores.PROGRESS_BASELINE_STORE, stores.BASELINE_CHANGE_HISTORY_STORE], "readonly");
  assert.equal((await request(tx.objectStore(stores.ONBOARDING_RECEIPT_STORE).getAll())).length, 0);
  assert.equal((await request(tx.objectStore(stores.ONBOARDING_RANK_HISTORY_STORE).getAll())).length, 0);
  assert.equal((await request(tx.objectStore(stores.CREDENTIAL_ARCHIVE_STORE).getAll())).length, 0);
  assert.equal((await request(tx.objectStore(stores.PROGRESS_BASELINE_STORE).getAll())).length, 1);
  assert.equal((await request(tx.objectStore(stores.BASELINE_CHANGE_HISTORY_STORE).getAll())).length, 0);
  await transaction(tx); check.close();
});

test("member baseline correction supports number-to-unknown-to-number with immutable history states", async () => {
  const fixture = await cryptoFixture();
  const envelope = await credential(fixture, payload(), 15);
  const factory = new IDBFactory();
  await registerMemberOnboardingToken(await tokenFor(envelope), {
    factory,
    verifierOptions: { registry: fixture.registry },
    now: () => "2026-10-02T07:00:00.000Z"
  });
  let state = await loadActiveOnboardingState(factory, { registry: fixture.registry });
  const baseline = state.baselines.find(row => row.kind === "current-rank-session");
  await updateProgressBaseline(baseline.baselineId, null, { factory, now: () => "2026-10-02T07:01:00.000Z" });
  await updateProgressBaseline(baseline.baselineId, 4, { factory, now: () => "2026-10-02T07:02:00.000Z" });
  state = await loadActiveOnboardingState(factory, { registry: fixture.registry });
  assert.equal(state.baselines.find(row => row.baselineId === baseline.baselineId).value, 4);
  const database = await openTrainingDatabase(factory);
  const tx = database.transaction(stores.BASELINE_CHANGE_HISTORY_STORE, "readonly");
  const rows = await request(tx.objectStore(stores.BASELINE_CHANGE_HISTORY_STORE).index("byBaselineId").getAll(baseline.baselineId));
  await transaction(tx); database.close();
  assert.deepEqual(rows.filter(row => row.actor === "member").sort((left, right) => left.changedAt.localeCompare(right.changedAt)).map(row => [row.before, row.after]), [
    [{ state: "known", value: 0 }, { state: "unknown" }],
    [{ state: "unknown" }, { state: "known", value: 4 }]
  ]);
});

test("same credential repairs rank without baseline reinjection; correction archives revision and rejects replay/fork/skip/downgrade/conflict", async () => {
  const fixture = await cryptoFixture();
  const firstEnvelope = await credential(fixture, payload(), 5);
  const firstToken = await tokenFor(firstEnvelope);
  const factory = new IDBFactory();
  await registerMemberOnboardingToken(firstToken, { factory, verifierOptions: { registry: fixture.registry }, now: () => "2026-10-02T06:01:00.000Z" });
  let state = await loadActiveOnboardingState(factory, { registry: fixture.registry });
  const baseline = state.baselines.find(row => row.kind === "current-rank-session");
  await updateProgressBaseline(baseline.baselineId, 7, { factory, now: () => "2026-10-02T06:02:00.000Z" });
  const database = await openTrainingDatabase(factory);
  const remove = database.transaction(stores.ONBOARDING_RANK_HISTORY_STORE, "readwrite");
  remove.objectStore(stores.ONBOARDING_RANK_HISTORY_STORE).delete(state.ranks[0].entryKey);
  await transaction(remove); database.close();
  await registerMemberOnboardingToken(firstToken, { factory, verifierOptions: { registry: fixture.registry } });
  state = await loadActiveOnboardingState(factory, { registry: fixture.registry });
  assert.equal(state.ranks.length, 2);
  assert.equal(state.baselines.find(row => row.baselineId === baseline.baselineId).value, 7);
  assert.equal(state.baselines.find(row => row.baselineId === baseline.baselineId).provenance, "self-recorded");
  const historyDb = await openTrainingDatabase(factory);
  const historyRead = historyDb.transaction(stores.BASELINE_CHANGE_HISTORY_STORE, "readonly");
  const baselineHistory = await request(historyRead.objectStore(stores.BASELINE_CHANGE_HISTORY_STORE).index("byBaselineId").getAll(baseline.baselineId));
  await transaction(historyRead); historyDb.close();
  assert.equal(baselineHistory.length, 2);
  const memberChange = baselineHistory.find(row => row.actor === "member");
  assert.deepEqual(memberChange, {
    changeId: memberChange.changeId,
    baselineId: baseline.baselineId,
    actor: "member",
    before: { state: "known", value: 0 },
    after: { state: "known", value: 7 },
    changedAt: "2026-10-02T06:02:00.000Z",
    sourceCredentialId: firstEnvelope.signed.credentialId
  });

  const correctedPayload = payload({
    revision: 2, supersedesCredentialId: firstEnvelope.signed.credentialId,
    recognizedRanks: [...payload().recognizedRanks, { entryId: b64id("or1_", 8), rankType: "kyu", rankValue: 7, rankDate: "2026-10-02" }],
    currentRankEntryId: b64id("or1_", 8), currentRankSessionBaseline: 99
  });
  const corrected = await credential(fixture, correctedPayload, 6);
  await registerMemberOnboardingToken(await tokenFor(corrected), { factory, verifierOptions: { registry: fixture.registry }, now: () => "2026-10-02T06:03:00.000Z" });
  state = await loadActiveOnboardingState(factory, { registry: fixture.registry });
  assert.equal(state.receipt.revision, 2);
  assert.equal(state.ranks.length, 3);
  assert.equal(deriveCurrentRankWithOnboarding([], state).rankValue, 7);
  assert.equal(state.baselines.find(row => row.baselineId === baseline.baselineId).value, 7);

  const cases = [
    [correctedPayload, 7, "reissue-replay"],
    [{ ...correctedPayload, currentRankSessionBaseline: 123 }, 13, "revision-conflict"],
    [{ ...correctedPayload, revision: 1, supersedesCredentialId: null }, 8, "revision-downgrade"],
    [{ ...correctedPayload, revision: 4, supersedesCredentialId: corrected.signed.credentialId }, 9, "revision-skip"],
    [{ ...correctedPayload, revision: 3, supersedesCredentialId: firstEnvelope.signed.credentialId }, 10, "revision-fork"],
    [{ ...correctedPayload, onboardingId: b64id("on1_", 9), revision: 1, supersedesCredentialId: null }, 11, "identity-conflict"],
    [{ ...correctedPayload, revision: 3, supersedesCredentialId: corrected.signed.credentialId, membership: { ...correctedPayload.membership, memberId: "ASD-001" } }, 14, "identity-conflict"]
  ];
  for (const [candidatePayload, byte, reason] of cases) {
    const candidate = await credential(fixture, candidatePayload, byte);
    const preview = await previewMemberOnboardingToken(await tokenFor(candidate), { factory, verifierOptions: { registry: fixture.registry } });
    assert.equal(preview.assessment.reason, reason);
  }
  const archiveDb = await openTrainingDatabase(factory);
  const archiveRead = archiveDb.transaction(stores.CREDENTIAL_ARCHIVE_STORE, "readonly");
  const archived = await request(archiveRead.objectStore(stores.CREDENTIAL_ARCHIVE_STORE).getAll());
  await transaction(archiveRead); archiveDb.close();
  assert.deepEqual(archived.map(row => row.credentialId).sort(), [firstEnvelope.signed.credentialId, corrected.signed.credentialId].sort());
  const rankDb = await openTrainingDatabase(factory);
  const rankRead = rankDb.transaction(stores.ONBOARDING_RANK_HISTORY_STORE, "readonly");
  const allRankRows = await request(rankRead.objectStore(stores.ONBOARDING_RANK_HISTORY_STORE).getAll());
  await transaction(rankRead); rankDb.close();
  assert.equal(allRankRows.length, 5);
  assert.deepEqual([...new Set(allRankRows.map(row => row.revision))], [1, 2]);
});

test("verified onboarding rank outranks self records and null-date attribution uses baselineAsOf with overlap warning", () => {
  const current = payload().recognizedRanks.at(-1);
  const onboardingState = {
    ranks: [{ ...current, entryKey: "active", recognizedAt: "2026-10-02", baselineAsOf: "2026-10-02", registeredAt: "2026-10-02T06:00:00Z" }],
    baselines: [{ kind: "current-rank-session", subjectId: current.entryId, value: 10, baselineAsOf: "2026-10-02" }]
  };
  const self = [{ id: "self", rankType: "dan", rankValue: 9, date: "2026-01-01", order: 1, source: "self", eventType: "self-recorded" }];
  assert.equal(deriveCurrentRankWithOnboarding(self, onboardingState).rankValue, 8);
  const analysis = createTrainingAnalysis(self, [
    { dojo: "d", sessionNo: 1, date: "2026-09-30", kata: [] },
    { dojo: "d", sessionNo: 2, date: "2026-10-03", kata: [] }
  ], catalog, onboardingState);
  assert.equal(analysis.progress.appActual, 1);
  assert.equal(analysis.progress.overlap, true);
  assert.equal(analysis.progress.values, null);
  assert.equal(analysis.progress.baseline.value, 10);
});

test("DB v6 has exact 16-store schema and Backup v1 restore preserves every v6-only row", async () => {
  const factory = new IDBFactory();
  const database = await openTrainingDatabase(factory);
  assert.equal(database.version, 6);
  assert.equal(database.objectStoreNames.length, 16);
  const expected = {
    onboardingReceipt: ["byCredentialId", "byMemberId"], onboardingRankHistory: ["byOnboarding", "byRankDate"],
    progressBaseline: ["byKind", "bySubject"], baselineChangeHistory: ["byBaselineId", "byChangedAt"],
    credentialArchive: ["byArchivedAt", "byDomain"], eventParticipation: [],
    eventChangeHistory: ["byChangedAt", "byEventKey"], externalEvent: ["byDeletedAt", "byUpdatedAt"], eventMemo: ["byUpdatedAt"]
  };
  const keyPaths = { onboardingReceipt: "onboardingId", onboardingRankHistory: "entryKey", progressBaseline: "baselineId", baselineChangeHistory: "changeId", credentialArchive: "credentialId", eventParticipation: "eventId", eventChangeHistory: "changeId", externalEvent: "eventId", eventMemo: "eventKey" };
  const read = database.transaction(Object.keys(expected), "readonly");
  for (const [name, indexes] of Object.entries(expected)) {
    const store = read.objectStore(name);
    assert.equal(store.keyPath, keyPaths[name]);
    assert.deepEqual([...store.indexNames], indexes);
  }
  await transaction(read); database.close();

  const beforeDb = await openTrainingDatabase(factory);
  const write = beforeDb.transaction(Object.keys(expected), "readwrite");
  write.objectStore("onboardingReceipt").put({ onboardingId: "on", credentialId: "c", memberId: "m" });
  write.objectStore("onboardingRankHistory").put({ entryKey: "e", onboardingId: "on", revision: 1, rankDate: null });
  write.objectStore("progressBaseline").put({ baselineId: "b", kind: "kata", subjectId: "k" });
  write.objectStore("baselineChangeHistory").put({ changeId: "h", baselineId: "b", changedAt: "t" });
  write.objectStore("credentialArchive").put({ credentialId: "a", domain: "d", archivedAt: "t" });
  write.objectStore("eventParticipation").put({ eventId: "p" });
  write.objectStore("eventChangeHistory").put({ changeId: "eh", eventKey: "e", changedAt: "t" });
  write.objectStore("externalEvent").put({ eventId: "x", updatedAt: "t", deletedAt: null });
  write.objectStore("eventMemo").put({ eventKey: "m", updatedAt: "t" });
  await transaction(write); beforeDb.close();
  const snapshot = async () => {
    const db = await openTrainingDatabase(factory); const tx = db.transaction(Object.keys(expected), "readonly");
    const rows = Object.fromEntries(await Promise.all(Object.keys(expected).map(async name => [name, await request(tx.objectStore(name).getAll())])));
    await transaction(tx); db.close(); return rows;
  };
  const before = await snapshot();
  const backup = createBackup({ memberProfile: [], promotionHistory: [], trainingSession: [], sessionKata: [] }, "2026-10-02T06:00:00.000Z");
  assert.deepEqual(Object.keys((await readBackupV1Data(factory))).sort(), ["memberProfile", "promotionHistory", "sessionKata", "trainingSession"]);
  await restoreBackupV1ToIndexedDb(backup, factory);
  assert.deepEqual(await snapshot(), before);
});

async function createV5(factory, rogue = false) {
  const open = factory.open(stores.TRAINING_DB_NAME, 5);
  open.onupgradeneeded = () => {
    const db = open.result;
    const training = db.createObjectStore(stores.TRAINING_SESSION_STORE, { keyPath: ["dojo", "sessionNo"] });
    training.createIndex("byDate", "date"); training.createIndex("bySource", "source");
    const kata = db.createObjectStore(stores.SESSION_KATA_STORE, { keyPath: ["dojo", "sessionNo", "order"] });
    kata.createIndex("bySession", ["dojo", "sessionNo"]);
    db.createObjectStore(stores.MEMBER_PROFILE_STORE, { keyPath: "id" });
    const promotions = db.createObjectStore(stores.PROMOTION_HISTORY_STORE, { keyPath: "id" }); promotions.createIndex("byOrder", "order", { unique: true });
    const snapshots = db.createObjectStore(stores.SHARED_SESSION_SNAPSHOT_STORE, { keyPath: ["dojo", "sessionNo"] }); snapshots.createIndex("byDate", "date");
    db.createObjectStore(stores.SAMSUNGDANG_MEMBERSHIP_STORE, { keyPath: "id" });
    const special = db.createObjectStore(stores.SPECIAL_TRAINING_HISTORY_STORE, { keyPath: "eventId" }); special.createIndex("byCredentialId", "credentialId", { unique: true });
    if (rogue) {
      const baseline = db.createObjectStore(stores.PROGRESS_BASELINE_STORE, { keyPath: "baselineId" });
      baseline.add({ baselineId: "one", kind: "kata", subjectId: "same" });
      baseline.add({ baselineId: "two", kind: "kata", subjectId: "same" });
    }
  };
  const db = await request(open);
  if (!rogue) {
    const tx = db.transaction(stores.SPECIAL_TRAINING_HISTORY_STORE, "readwrite");
    tx.objectStore(stores.SPECIAL_TRAINING_HISTORY_STORE).put({ eventId: "st", credentialId: "cred", value: "preserve" });
    await transaction(tx);
  }
  db.close();
}

test("v5→v6 adds only new schema and preserves special v1 bytes; failed unique-index upgrade rolls back to v5", async () => {
  const factory = new IDBFactory();
  await createV5(factory);
  let database = await openTrainingDatabase(factory);
  const row = await request(database.transaction(stores.SPECIAL_TRAINING_HISTORY_STORE).objectStore(stores.SPECIAL_TRAINING_HISTORY_STORE).get("st"));
  assert.deepEqual(row, { eventId: "st", credentialId: "cred", value: "preserve" });
  assert.equal(database.version, 6); database.close();

  const abortFactory = new IDBFactory();
  await createV5(abortFactory, true);
  await assert.rejects(openTrainingDatabase(abortFactory));
  const reopened = await request(abortFactory.open(stores.TRAINING_DB_NAME));
  assert.equal(reopened.version, 5);
  assert.equal(reopened.objectStoreNames.contains(stores.ONBOARDING_RECEIPT_STORE), false);
  reopened.close();
});

test("blocked-upgrade rejection path remains installed", async () => {
  const source = await readFile(new URL("../app/training-database.mjs", import.meta.url), "utf8");
  assert.match(source, /request\.onblocked = \(\) => reject/);
});
