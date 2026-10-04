import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";
import { canonicalize } from "json-canonicalize";

import { readBackupV1Data, restoreBackupV1ToIndexedDb } from "../app/backup-indexeddb.mjs";
import { createBackup } from "../app/backup.mjs";
import { encodeUnpaddedBase64Url } from "../app/credential/base64url.mjs";
import { calculateKeyIdFromSpki, encodeCredentialTransportJson } from "../app/credential/credential-verifier.mjs";
import { verifySpecialTrainingCredentialJson } from "../app/credential/special-training-verifier.mjs";
import {
  createExternalEvent,
  deleteExternalEvent,
  loadEventTrainingData,
  saveEventMemo,
  updateExternalEvent,
  updateSpecialParticipation
} from "../app/event-store.mjs";
import { deriveVerifiedRankAtDate } from "../app/member-data.mjs";
import { registerMembershipCredentialToken } from "../app/membership-store.mjs";
import {
  previewSpecialTrainingCredentialToken,
  registerSpecialTrainingCredentialToken
} from "../app/special-training-store.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "../app/training-database.mjs";
import { createTrainingAnalysis } from "../app/training-progress.mjs";
import {
  CREDENTIAL_ARCHIVE_STORE,
  EVENT_CHANGE_HISTORY_STORE,
  EVENT_MEMO_STORE,
  EVENT_PARTICIPATION_STORE,
  EXTERNAL_EVENT_STORE,
  SESSION_KATA_STORE,
  TRAINING_SESSION_STORE
} from "../app/training-records.mjs";

const read = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const v1Json = await read("special-training-A1-test-credential-v1.json");
const membershipJson = await read("membership-test-credential-v1.json");
const v1 = JSON.parse(v1Json);

const binaryId = (prefix, fill) => prefix + encodeUnpaddedBase64Url(new Uint8Array(16).fill(fill));
const eventId = binaryId("st1_", 31);
const session1 = binaryId("sts1_", 41);
const session2 = binaryId("sts1_", 42);
const session3 = binaryId("sts1_", 43);

function payload(overrides = {}) {
  return {
    eventId,
    revision: 1,
    supersedesCredentialId: null,
    title: "Phase 4K-D 특별수련",
    category: "special-training",
    startDate: "2026-10-10",
    endDate: "2026-10-11",
    instructor: "테스트 지도자",
    sessions: [
      { sessionId: session1, date: "2026-10-10", label: "오전 수련" },
      { sessionId: session2, date: "2026-10-11", label: "오후 수련" }
    ],
    ...overrides
  };
}

function envelope(fill, specialPayload = payload()) {
  return JSON.stringify({
    signed: {
      ...v1.signed,
      credentialVersion: 2,
      credentialId: binaryId("c1_", fill),
      issuedAt: `2026-10-${String(fill).padStart(2, "0")}T00:00:00Z`,
      payload: specialPayload
    },
    signature: v1.signature
  });
}

function acceptingCrypto() {
  const subtle = globalThis.crypto.subtle;
  return { subtle: {
    digest: subtle.digest.bind(subtle),
    importKey: subtle.importKey.bind(subtle),
    verify: async () => true
  } };
}

const verifierOptions = { crypto: acceptingCrypto() };
const token = json => encodeCredentialTransportJson(json);

async function all(factory, storeName) {
  const database = await openTrainingDatabase(factory);
  try {
    const tx = database.transaction(storeName, "readonly");
    const rows = await requestResult(tx.objectStore(storeName).getAll());
    await transactionDone(tx);
    return rows;
  } finally {
    database.close();
  }
}

test("special v2 validates signed ordered sessions and rejects malformed session semantics", async () => {
  const valid = await verifySpecialTrainingCredentialJson(envelope(1), verifierOptions);
  assert.equal(valid.valid, true);
  assert.equal(valid.credentialVersion, 2);
  assert.deepEqual(valid.verifiedPayload.sessions.map(item => item.sessionId), [session1, session2]);

  for (const invalidPayload of [
    payload({ sessions: [] }),
    payload({ sessions: [{ sessionId: session1, date: "2026-10-10", label: " " }] }),
    payload({ sessions: [{ sessionId: session1, date: "2026-10-12", label: "범위 밖" }] }),
    payload({ sessions: [
      { sessionId: session1, date: "2026-10-10", label: "오전" },
      { sessionId: session1, date: "2026-10-11", label: "오후" }
    ] })
  ]) {
    assert.equal((await verifySpecialTrainingCredentialJson(envelope(2, invalidPayload), verifierOptions)).valid, false);
  }
});

test("special v2 verifies an actual JCS P-256 64-byte signature", async () => {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const keyId = await calculateKeyIdFromSpki(spki);
  const signed = {
    ...v1.signed,
    credentialVersion: 2,
    credentialId: binaryId("c1_", 12),
    keyId,
    issuedAt: "2026-10-12T00:00:00Z",
    payload: payload()
  };
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey,
    new TextEncoder().encode(canonicalize(signed))
  ));
  assert.equal(signature.byteLength, 64);
  const registry = {
    [keyId]: { keyId, publicKeySpkiBase64Url: encodeUnpaddedBase64Url(spki), status: "active" }
  };
  const result = await verifySpecialTrainingCredentialJson(JSON.stringify({
    signed, signature: encodeUnpaddedBase64Url(signature)
  }), { registry });
  assert.equal(result.valid, true);
});

test("special v2 raw and gz1 transports verify to the same envelope", async () => {
  const json = envelope(13);
  const rawResult = await previewSpecialTrainingCredentialToken(token(json), {
    factory: new IDBFactory(), verifierOptions
  });
  const input = new TextEncoder().encode(json);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const gzResult = await previewSpecialTrainingCredentialToken(`gz1.${encodeUnpaddedBase64Url(compressed)}`, {
    factory: new IDBFactory(), verifierOptions
  });
  assert.equal(rawResult.verification.valid, true);
  assert.equal(gzResult.verification.valid, true);
  assert.deepEqual(gzResult.verification.verifiedPayload, rawResult.verification.verifiedPayload);
});

test("special v2 B and A confirm independently; initial preview is unselected and requires one choice", async () => {
  for (const membership of [false, true]) {
    const factory = new IDBFactory();
    if (membership) await registerMembershipCredentialToken(token(membershipJson), { factory });
    const credentialToken = token(envelope(membership ? 4 : 3));
    const preview = await previewSpecialTrainingCredentialToken(credentialToken, { factory, verifierOptions });
    assert.equal(preview.assessment.canConfirm, true);
    assert.equal(preview.participation, null);
    await assert.rejects(registerSpecialTrainingCredentialToken(credentialToken, { factory, verifierOptions }), { code: "session-selection-required" });
    const registered = await registerSpecialTrainingCredentialToken(credentialToken, {
      factory, verifierOptions, selectedSessionIds: [session2]
    });
    assert.deepEqual(registered.participation.selectedSessionIds, [session2]);
    assert.equal((await all(factory, TRAINING_SESSION_STORE)).length, 0);
    assert.equal((await all(factory, SESSION_KATA_STORE)).length, 0);
  }
});

test("special v2 correction archives predecessor and reconciles sessions without silent participant overwrite", async () => {
  const factory = new IDBFactory();
  const firstJson = envelope(5);
  await registerSpecialTrainingCredentialToken(token(firstJson), {
    factory, verifierOptions, selectedSessionIds: [session1, session2], now: () => "2026-10-12T00:00:00.000Z"
  });
  const firstId = JSON.parse(firstJson).signed.credentialId;
  const correctedPayload = payload({
    revision: 2,
    supersedesCredentialId: firstId,
    sessions: [
      { sessionId: session1, date: "2026-10-10", label: "오전 수련" },
      { sessionId: session3, date: "2026-10-11", label: "저녁 수련" }
    ]
  });
  await registerSpecialTrainingCredentialToken(token(envelope(6, correctedPayload)), {
    factory, verifierOptions, selectedSessionIds: [session3], now: () => "2026-10-13T00:00:00.000Z"
  });
  assert.deepEqual((await all(factory, EVENT_PARTICIPATION_STORE))[0].selectedSessionIds, [session1]);
  assert.equal((await all(factory, CREDENTIAL_ARCHIVE_STORE))[0].credentialId, firstId);
  const changes = await all(factory, EVENT_CHANGE_HISTORY_STORE);
  assert.equal(changes.length, 2);
  const selections = changes.map(item => item.after.selectedSessionIds).sort((left, right) => right.length - left.length);
  assert.deepEqual(selections[0], [session1, session2]);
  assert.deepEqual(selections[1], [session1]);

  await assert.rejects(registerSpecialTrainingCredentialToken(token(envelope(7, correctedPayload)), {
    factory, verifierOptions, selectedSessionIds: [session1]
  }), { code: "event-replay" });
  const secondId = JSON.parse(envelope(6, correctedPayload)).signed.credentialId;
  await assert.rejects(registerSpecialTrainingCredentialToken(token(envelope(14, payload({
    revision: 3,
    supersedesCredentialId: secondId,
    sessions: [{ sessionId: session1, date: "2026-10-10", label: "의미 변경" }]
  }))), { factory, verifierOptions, selectedSessionIds: [session1] }), { code: "session-identity-conflict" });
  await assert.rejects(registerSpecialTrainingCredentialToken(token(envelope(8, payload({
    revision: 3, supersedesCredentialId: binaryId("c1_", 99)
  }))), { factory, verifierOptions, selectedSessionIds: [session1] }), { code: "revision-fork" });
  await assert.rejects(registerSpecialTrainingCredentialToken(token(envelope(9, payload({
    revision: 4, supersedesCredentialId: secondId
  }))), { factory, verifierOptions, selectedSessionIds: [session1] }), { code: "revision-skip" });
  await assert.rejects(registerSpecialTrainingCredentialToken(token(envelope(19, payload())), {
    factory, verifierOptions, selectedSessionIds: [session1]
  }), { code: "revision-downgrade" });
});

test("a current v1 event expands only through v2 revision 1 with the exact v1 predecessor", async () => {
  const factory = new IDBFactory();
  await registerSpecialTrainingCredentialToken(token(v1Json), { factory });
  const v1EventId = v1.signed.payload.eventId;
  const v1Session = binaryId("sts1_", 45);
  const expanded = payload({
    eventId: v1EventId,
    revision: 1,
    supersedesCredentialId: v1.signed.credentialId,
    title: v1.signed.payload.title,
    startDate: v1.signed.payload.startDate,
    endDate: v1.signed.payload.endDate,
    instructor: v1.signed.payload.instructor,
    sessions: [{ sessionId: v1Session, date: v1.signed.payload.startDate, label: "서명된 수련" }]
  });
  await registerSpecialTrainingCredentialToken(token(envelope(18, expanded)), {
    factory, verifierOptions, selectedSessionIds: [v1Session]
  });
  assert.equal((await all(factory, CREDENTIAL_ARCHIVE_STORE))[0].credentialId, v1.signed.credentialId);
  assert.deepEqual((await all(factory, EVENT_PARTICIPATION_STORE))[0].selectedSessionIds, [v1Session]);
});

test("participation edits keep current state and append check/uncheck history", async () => {
  const factory = new IDBFactory();
  await registerSpecialTrainingCredentialToken(token(envelope(10)), {
    factory, verifierOptions, selectedSessionIds: [session1]
  });
  await updateSpecialParticipation(eventId, [session1, session2], { factory, verifierOptions, now: () => "2026-10-14T00:00:00.000Z" });
  await updateSpecialParticipation(eventId, [], { factory, verifierOptions, now: () => "2026-10-15T00:00:00.000Z" });
  assert.deepEqual((await all(factory, EVENT_PARTICIPATION_STORE))[0].selectedSessionIds, []);
  assert.equal((await all(factory, EVENT_CHANGE_HISTORY_STORE)).length, 3);
});

test("competing corrections cannot silently overwrite the current revision", async () => {
  const factory = new IDBFactory();
  const firstJson = envelope(15);
  const firstId = JSON.parse(firstJson).signed.credentialId;
  await registerSpecialTrainingCredentialToken(token(firstJson), {
    factory, verifierOptions, selectedSessionIds: [session1]
  });
  const correctionA = envelope(16, payload({
    revision: 2, supersedesCredentialId: firstId,
    sessions: [{ sessionId: session1, date: "2026-10-10", label: "오전 수련" }]
  }));
  const correctionB = envelope(17, payload({
    revision: 2, supersedesCredentialId: firstId,
    sessions: [
      { sessionId: session1, date: "2026-10-10", label: "오전 수련" },
      { sessionId: session3, date: "2026-10-11", label: "추가 수련" }
    ]
  }));
  const outcomes = await Promise.allSettled([
    registerSpecialTrainingCredentialToken(token(correctionA), { factory, verifierOptions }),
    registerSpecialTrainingCredentialToken(token(correctionB), { factory, verifierOptions })
  ]);
  assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(item => item.status === "rejected").length, 1);
  assert.equal((await all(factory, CREDENTIAL_ARCHIVE_STORE)).length, 1);
});

test("external CRUD uses tombstones/history, event memo is independent, and training sources never create fake rows", async () => {
  const factory = new IDBFactory();
  await registerSpecialTrainingCredentialToken(token(envelope(11)), {
    factory, verifierOptions, selectedSessionIds: [session1]
  });
  const external = await createExternalEvent({
    title: "외부 세미나", organizer: "타 도장", location: "서울",
    sessions: [{ date: "2026-10-10", label: "오전" }, { date: "2026-10-10", label: "오후" }]
  }, { factory, eventId: binaryId("xe1_", 50), now: () => "2026-10-10T00:00:00.000Z" });
  assert.equal((await loadEventTrainingData(factory, verifierOptions)).external.length, 2);
  await saveEventMemo(`samsungdang:${eventId}`, "회원 특별수련 메모", { factory, now: () => "2026-10-11T00:00:00.000Z" });
  await saveEventMemo(`external:${external.eventId}`, "회원 외부행사 메모", { factory, now: () => "2026-10-11T00:00:00.000Z" });
  await updateExternalEvent(external.eventId, {
    title: "수정 외부 세미나", organizer: null, location: null,
    sessions: [external.sessions[0]]
  }, { factory, now: () => "2026-10-12T00:00:00.000Z" });
  const training = await loadEventTrainingData(factory, verifierOptions);
  assert.equal(training.special.length, 1);
  assert.equal(training.external.length, 1);
  assert.equal((await all(factory, TRAINING_SESSION_STORE)).length, 0);
  assert.equal((await all(factory, SESSION_KATA_STORE)).length, 0);
  await deleteExternalEvent(external.eventId, { factory, now: () => "2026-10-13T00:00:00.000Z" });
  assert.equal((await loadEventTrainingData(factory, verifierOptions)).external.length, 0);
  assert.notEqual((await all(factory, EXTERNAL_EVENT_STORE))[0].deletedAt, null);
  assert.equal((await all(factory, EVENT_MEMO_STORE)).length, 2);
  assert.deepEqual(new Set((await all(factory, EVENT_CHANGE_HISTORY_STORE)).map(item => item.kind)), new Set([
    "participation-change", "external-create", "external-update", "external-delete"
  ]));
});

test("overall count/source breakdown and verified session-date rank attribution include unknown but exclude it from current rank", () => {
  const promotions = [
    { id: "p8", source: "samsungdang", rankType: "kyu", rankValue: 8, date: "2026-10-10", order: 1 },
    { id: "p7", source: "samsungdang", rankType: "kyu", rankValue: 7, date: "2026-10-20", order: 2 }
  ];
  assert.equal(deriveVerifiedRankAtDate(promotions, null, "2026-10-10"), null);
  assert.equal(deriveVerifiedRankAtDate(promotions, null, "2026-10-20").rankValue, 8);
  assert.equal(deriveVerifiedRankAtDate(promotions, null, "2026-10-21").rankValue, 7);
  const analysis = createTrainingAnalysis(promotions, [{ date: "2026-10-09", dojo: "d", sessionNo: 1, kata: [] }], { kata: [] }, null, {
    special: [{ date: "2026-10-20" }],
    external: [{ date: "2026-10-21" }, { date: "2026-10-21" }]
  });
  assert.equal(analysis.totalTrainingSessions, 4);
  assert.deepEqual(analysis.trainingCounts, { total: 4, sources: { general: 1, special: 1, external: 2 } });
  assert.equal(analysis.progress.appActual, 2);
  assert.equal(analysis.exam.all.entries.length, 0);
});

test("Backup v1 excludes and same-device restore preserves all Phase 4K v6 event stores", async () => {
  const factory = new IDBFactory();
  await createExternalEvent({ title: "보존", sessions: [{ date: "2026-10-10", label: "1회" }] }, {
    factory, eventId: binaryId("xe1_", 60)
  });
  await saveEventMemo(`external:${binaryId("xe1_", 60)}`, "보존 메모", { factory });
  const before = {
    external: await all(factory, EXTERNAL_EVENT_STORE),
    history: await all(factory, EVENT_CHANGE_HISTORY_STORE),
    memo: await all(factory, EVENT_MEMO_STORE)
  };
  const backup = createBackup(await readBackupV1Data(factory), "2026-10-16T00:00:00.000Z");
  assert.deepEqual(Object.keys(backup.data).sort(), ["memberProfile", "promotionHistory", "sessionKata", "trainingSession"]);
  await restoreBackupV1ToIndexedDb(backup, factory);
  assert.deepEqual(await all(factory, EXTERNAL_EVENT_STORE), before.external);
  assert.deepEqual(await all(factory, EVENT_CHANGE_HISTORY_STORE), before.history);
  assert.deepEqual(await all(factory, EVENT_MEMO_STORE), before.memo);
});

test("Phase 4K-D keeps DB v6, 16 stores, and the source-authoritative credentialArchive byDomain(domain) index", async () => {
  const database = await openTrainingDatabase(new IDBFactory());
  assert.equal(database.version, 6);
  assert.equal(database.objectStoreNames.length, 16);
  const transaction = database.transaction(CREDENTIAL_ARCHIVE_STORE, "readonly");
  assert.equal(transaction.objectStore(CREDENTIAL_ARCHIVE_STORE).index("byDomain").keyPath, "domain");
  await transactionDone(transaction);
  database.close();
});
