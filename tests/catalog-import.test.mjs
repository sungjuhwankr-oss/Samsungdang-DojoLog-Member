import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  KATA_CATALOG_STATUS,
  validateSessionKataCatalog
} from "../app/kata-catalog-validation.mjs";
import { parseSessionHash } from "../app/session-share.mjs";
import {
  createMemoryTrainingRepository,
  saveTrainingSession
} from "../app/training-records.mjs";

const catalog = JSON.parse(
  await readFile(new URL("../reference/kata-catalog.v1.json", import.meta.url), "utf8")
);

const knownMatch = {
  id: "뒤양손잡기-허리던지기",
  name: "뒤양손잡기 허리던지기"
};
const knownMismatch = {
  id: "뒤양손잡기-허리던지기",
  name: "테스트용 다른 이름"
};
const unknown = {
  id: "future-kata-id",
  name: "미래 카타"
};
const basePayload = {
  schema: "samsungdang-dojolog-session",
  version: 1,
  dojo: "samsungdang",
  sessionNo: 1042,
  date: "2026-09-13",
  kata: [knownMatch]
};

function parsePayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return parseSessionHash("#session=" + encoded);
}

function validationFor(snapshot) {
  return validateSessionKataCatalog([snapshot], catalog)[0];
}

async function saveAndRead(snapshot) {
  const repository = createMemoryTrainingRepository();
  const payload = { ...basePayload, kata: [snapshot] };
  const validation = validateSessionKataCatalog(payload.kata, catalog);
  const result = await saveTrainingSession(
    repository,
    payload,
    "2026-09-15T00:00:00.000Z"
  );
  return { result, validation, saved: (await repository.list())[0] };
}

test("Phase 4C uses the complete unique 77-entry canonical catalog", () => {
  assert.equal(catalog.kata.length, 77);
  assert.equal(new Set(catalog.kata.map((kata) => kata.id)).size, 77);
});

test("KNOWN_MATCH requires an exact ID and canonical name match", () => {
  assert.deepEqual(validationFor(knownMatch), {
    index: 0,
    status: KATA_CATALOG_STATUS.KNOWN_MATCH,
    id: knownMatch.id,
    name: knownMatch.name,
    canonicalName: knownMatch.name
  });
});

test("UNKNOWN_ID is a catalog warning, not a structural hard failure", () => {
  const parsed = parsePayload({ ...basePayload, kata: [unknown] });
  assert.equal(parsed.ok, true);
  assert.equal(validationFor(unknown).status, KATA_CATALOG_STATUS.UNKNOWN_ID);
});

test("UNKNOWN_ID keeps the payload snapshot and does not remap by known name", () => {
  const snapshot = { id: unknown.id, name: knownMatch.name };
  const before = structuredClone(snapshot);
  assert.deepEqual(validationFor(snapshot), {
    index: 0,
    status: KATA_CATALOG_STATUS.UNKNOWN_ID,
    id: snapshot.id,
    name: snapshot.name,
    canonicalName: null
  });
  assert.deepEqual(snapshot, before);
});

test("KNOWN_ID_NAME_MISMATCH exposes canonical name without changing the snapshot", () => {
  const before = structuredClone(knownMismatch);
  assert.deepEqual(validationFor(knownMismatch), {
    index: 0,
    status: KATA_CATALOG_STATUS.KNOWN_ID_NAME_MISMATCH,
    id: knownMismatch.id,
    name: knownMismatch.name,
    canonicalName: knownMatch.name
  });
  assert.deepEqual(knownMismatch, before);
});

test("known canonical payload remains explicitly saveable", async () => {
  const { result, validation, saved } = await saveAndRead(knownMatch);
  assert.equal(validation[0].status, KATA_CATALOG_STATUS.KNOWN_MATCH);
  assert.equal(result.status, "saved");
  assert.deepEqual(saved.kata[0], { ...knownMatch, order: 0 });
});

test("UNKNOWN_ID warning payload saves its original ID and name", async () => {
  const { result, validation, saved } = await saveAndRead(unknown);
  assert.equal(validation[0].status, KATA_CATALOG_STATUS.UNKNOWN_ID);
  assert.equal(result.status, "saved");
  assert.deepEqual(saved.kata[0], { ...unknown, order: 0 });
});

test("name mismatch warning payload saves its original ID and name", async () => {
  const { result, validation, saved } = await saveAndRead(knownMismatch);
  assert.equal(validation[0].status, KATA_CATALOG_STATUS.KNOWN_ID_NAME_MISMATCH);
  assert.equal(validation[0].canonicalName, knownMatch.name);
  assert.equal(result.status, "saved");
  assert.deepEqual(saved.kata[0], { ...knownMismatch, order: 0 });
});

test("catalog warnings do not alter the duplicate session policy", async () => {
  const repository = createMemoryTrainingRepository();
  const payload = { ...basePayload, kata: [unknown] };
  await saveTrainingSession(repository, payload, "2026-09-15T00:00:00.000Z");
  const duplicate = await saveTrainingSession(
    repository,
    payload,
    "2026-09-15T00:01:00.000Z"
  );
  assert.equal(duplicate.status, "duplicate");
});

test("catalog warnings do not alter the same-identity date conflict policy", async () => {
  const repository = createMemoryTrainingRepository();
  const payload = { ...basePayload, kata: [knownMismatch] };
  await saveTrainingSession(repository, payload, "2026-09-15T00:00:00.000Z");
  const conflict = await saveTrainingSession(
    repository,
    { ...payload, date: "2026-09-14" },
    "2026-09-15T00:01:00.000Z"
  );
  assert.equal(conflict.status, "conflict");
});

test("preview explains both catalog warning types and keeps explicit save", async () => {
  const source = await readFile(
    new URL("../app/components/fragment-probe.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /현재 앱의 카타 목록에서 확인되지 않는 항목/);
  assert.match(source, /원본 ID와 이름 그대로 저장할 수 있습니다/);
  assert.match(source, /공유된 이름: \{validation\.name\}/);
  assert.match(source, /현재 카타 이름: \{validation\.canonicalName\}/);
  assert.match(source, /ID는 동일하며 공유된 이름 그대로 저장할 수 있습니다/);
  assert.match(source, /saveTrainingSessionToIndexedDb\(payload\)/);
});
