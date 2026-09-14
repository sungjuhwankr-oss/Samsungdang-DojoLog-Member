import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMemberProfile,
  createPromotion,
  deriveCurrentRank,
  findCanonicalKata,
  nextPromotionOrder,
  planSchemaUpgrade
} from "../app/member-data.mjs";
import {
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE,
  SESSION_KATA_STORE,
  TRAINING_DB_VERSION,
  TRAINING_SESSION_STORE
} from "../app/training-records.mjs";

const catalog = JSON.parse(
  await readFile(new URL("../reference/kata-catalog.v1.json", import.meta.url), "utf8")
);

test("Phase 3 stores are preserved by the v2 migration plan", () => {
  const plan = planSchemaUpgrade([TRAINING_SESSION_STORE, SESSION_KATA_STORE]);
  assert.equal(TRAINING_DB_VERSION, 2);
  assert.deepEqual(plan.preserve, [TRAINING_SESSION_STORE, SESSION_KATA_STORE]);
  assert.deepEqual(plan.create, [MEMBER_PROFILE_STORE, PROMOTION_HISTORY_STORE]);
});

test("memberProfile stores and returns the minimum fields", () => {
  assert.deepEqual(createMemberProfile({
    name: "홍길동",
    memberNo: "S-1042",
    joinDate: "2026-01-02"
  }), {
    id: "self",
    name: "홍길동",
    memberNo: "S-1042",
    joinDate: "2026-01-02"
  });
});

test("memberProfile allows null joinDate", () => {
  assert.equal(createMemberProfile({ name: "홍길동", memberNo: "S-1", joinDate: null }).joinDate, null);
});

test("memberProfile allows null memberNo", () => {
  assert.equal(createMemberProfile({ name: "홍길동", memberNo: null, joinDate: null }).memberNo, null);
});

test("promotionHistory stores a kyu promotion", () => {
  assert.deepEqual(createPromotion({ rankType: "kyu", rankValue: 9, date: null }, 1, "p-1"), {
    id: "p-1",
    rankType: "kyu",
    rankValue: 9,
    date: null,
    order: 1
  });
});

test("promotion date may be unknown", () => {
  assert.equal(createPromotion({ rankType: "dan", rankValue: 1, date: null }, 2, "p-2").date, null);
});

test("current rank is derived from the highest order", () => {
  const current = deriveCurrentRank([
    createPromotion({ rankType: "kyu", rankValue: 8, date: null }, 1, "p-1"),
    createPromotion({ rankType: "kyu", rankValue: 7, date: "2026-07-11" }, 3, "p-3"),
    createPromotion({ rankType: "kyu", rankValue: 6, date: null }, 2, "p-2")
  ]);
  assert.equal(current?.rankValue, 7);
});

test("kyu rank label is derived", () => {
  assert.equal(deriveCurrentRank([createPromotion({ rankType: "kyu", rankValue: 7, date: null }, 1, "p")])?.label, "7급");
});

test("dan rank label is derived", () => {
  assert.equal(deriveCurrentRank([createPromotion({ rankType: "dan", rankValue: 2, date: null }, 1, "p")])?.label, "2단");
});

test("zero rank sentinel is rejected", () => {
  assert.throws(
    () => createPromotion({ rankType: "kyu", rankValue: 0, date: null }, 1, "p"),
    /positive integer/
  );
});

test("canonical kata reference snapshot loads", () => {
  assert.equal(catalog.catalogVersion, 1);
  assert.ok(Array.isArray(catalog.kata));
  assert.ok(catalog.kata.length > 0);
});

test("known kata id lookup returns the canonical entry", () => {
  assert.equal(
    findCanonicalKata(catalog, "뒤양손잡기-허리던지기")?.nameKo,
    "뒤양손잡기 허리던지기"
  );
});

test("unknown kata remains unchanged and is not remapped", () => {
  const unknown = { id: "unknown-id", name: "원본 이름" };
  assert.equal(findCanonicalKata(catalog, unknown.id), null);
  assert.deepEqual(unknown, { id: "unknown-id", name: "원본 이름" });
});

test("next promotion order is monotonic", () => {
  assert.equal(nextPromotionOrder([{ order: 1 }, { order: 4 }, { order: 2 }]), 5);
});

test("existing Phase 3 duplicate rule remains unchanged", async () => {
  const source = await readFile(new URL("../app/training-records.mjs", import.meta.url), "utf8");
  assert.match(source, /existing\.date === payload\.date/);
  assert.match(source, /status: "duplicate"/);
  assert.match(source, /status: "conflict"/);
});

test("migration never clears or deletes existing stores", async () => {
  const source = await readFile(new URL("../app/training-store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /deleteObjectStore|\.clear\(|indexedDB\.deleteDatabase/);
});
