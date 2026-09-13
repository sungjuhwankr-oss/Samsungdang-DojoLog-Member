import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DECODED_BYTES,
  MAX_FRAGMENT_LENGTH,
  MAX_KATA_COUNT,
  parseSessionHash
} from "../app/session-share.mjs";

const basePayload = {
  schema: "samsungdang-dojolog-session",
  version: 1,
  dojo: "samsungdang",
  sessionNo: 1042,
  date: "2026-09-13",
  kata: [
    {
      id: "뒤양손잡기-허리던지기",
      name: "뒤양손잡기 허리던지기"
    }
  ]
};

function encodeText(text) {
  return Buffer.from(text, "utf8").toString("base64url");
}

function encodePayload(overrides = {}) {
  return encodeText(JSON.stringify({ ...basePayload, ...overrides }));
}

function parseEncoded(encoded) {
  return parseSessionHash("#session=" + encoded);
}

function assertError(result, code) {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

test("valid single-kata payload", () => {
  const result = parseEncoded(encodePayload());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.sessionNo, 1042);
    assert.equal(result.payload.kata.length, 1);
  }
});

test("valid multi-kata payload", () => {
  const result = parseEncoded(encodePayload({
    kata: [
      ...basePayload.kata,
      { id: "정면타-팔꺾기", name: "정면타 팔꺾기" }
    ]
  }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.kata.length, 2);
});

test("Korean UTF-8 kata survives decoding", () => {
  const result = parseEncoded(encodePayload());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.kata[0].id, "뒤양손잡기-허리던지기");
    assert.equal(result.payload.kata[0].name, "뒤양손잡기 허리던지기");
  }
});

test("maximum allowed kata count is accepted", () => {
  const kata = Array.from({ length: MAX_KATA_COUNT }, (_, index) => ({
    id: "kata-" + index,
    name: "수련 " + index
  }));
  const result = parseEncoded(encodePayload({ kata }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.payload.kata.length, MAX_KATA_COUNT);
});

test("no session", () => {
  assertError(parseSessionHash(""), "no-session");
});

test("invalid base64url", () => {
  assertError(parseEncoded("***"), "invalid-base64url");
});

test("invalid UTF-8", () => {
  const encoded = Buffer.from([0xc3, 0x28]).toString("base64url");
  assertError(parseEncoded(encoded), "invalid-utf8");
});

test("invalid JSON", () => {
  assertError(parseEncoded(encodeText("{not-json")), "invalid-json");
});

test("wrong schema", () => {
  assertError(parseEncoded(encodePayload({ schema: "wrong" })), "invalid-schema");
});

test("unsupported version", () => {
  assertError(parseEncoded(encodePayload({ version: 2 })), "unsupported-version");
});

test("wrong dojo", () => {
  assertError(parseEncoded(encodePayload({ dojo: "other" })), "invalid-dojo");
});

test("invalid sessionNo", () => {
  assertError(parseEncoded(encodePayload({ sessionNo: 0 })), "invalid-session-no");
});

test("invalid date", () => {
  assertError(parseEncoded(encodePayload({ date: "2026-02-30" })), "invalid-date");
});

test("empty kata", () => {
  assertError(parseEncoded(encodePayload({ kata: [] })), "invalid-kata-array");
});

test("malformed kata item", () => {
  assertError(
    parseEncoded(encodePayload({ kata: [{ id: "", name: "이름" }] })),
    "invalid-kata-item"
  );
});

test("oversized fragment", () => {
  assertError(
    parseSessionHash("#session=" + "A".repeat(MAX_FRAGMENT_LENGTH + 1)),
    "fragment-too-long"
  );
});

test("oversized decoded payload", () => {
  const encoded = Buffer.alloc(MAX_DECODED_BYTES + 1, 0x20).toString("base64url");
  assert.ok(encoded.length <= MAX_FRAGMENT_LENGTH);
  assertError(parseEncoded(encoded), "decoded-too-large");
});
