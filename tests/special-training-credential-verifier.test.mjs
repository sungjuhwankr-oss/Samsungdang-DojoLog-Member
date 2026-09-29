import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { encodeUnpaddedBase64Url } from "../app/credential/base64url.mjs";
import { verifyCredentialJson } from "../app/credential/credential-verifier.mjs";
import {
  CREDENTIAL_REASON,
  encodeCredentialTransportJson,
  verifySpecialTrainingCredentialJson,
  verifySpecialTrainingCredentialToken
} from "../app/credential/special-training-verifier.mjs";
import { PRODUCTION_TRUSTED_KEY_REGISTRY } from "../app/credential/trusted-key-registry.mjs";

const fixture = async (name) => {
  const bytes = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
  return { bytes, json: bytes.toString("utf8"), value: JSON.parse(bytes.toString("utf8")) };
};
const a1 = await fixture("special-training-A1-test-credential-v1.json");
const a2 = await fixture("special-training-A2-same-event-test-credential-v1.json");
const b1 = await fixture("special-training-B1-same-date-different-event-test-credential-v1.json");
const clone = (value) => structuredClone(value);
const verifyObject = (value, options) => verifySpecialTrainingCredentialJson(JSON.stringify(value), options);

test("Phase 4J-A handoff fixtures retain exact SHA-256 and semantic relations", () => {
  assert.equal(createHash("sha256").update(a1.bytes).digest("hex"), "dd81a12512429ba3610ef3172d87d2fa7f19717e8e7e495b93abf5f052e3218b");
  assert.equal(createHash("sha256").update(a2.bytes).digest("hex"), "956f0f891728fe2ec615e5e108917b842df8fa9366ed3d3a56603c7588b465a3");
  assert.equal(createHash("sha256").update(b1.bytes).digest("hex"), "a46417a485542a632e03c360d22228c666769c15e3faa9be77f895464eeeaf1e");
  assert.equal(a1.value.signed.payload.eventId, a2.value.signed.payload.eventId);
  assert.notEqual(a1.value.signed.credentialId, a2.value.signed.credentialId);
  assert.deepEqual(a1.value.signed.payload, a2.value.signed.payload);
  assert.notEqual(a1.value.signed.payload.eventId, b1.value.signed.payload.eventId);
  assert.equal(a1.value.signed.payload.startDate, b1.value.signed.payload.startDate);
});

for (const [name, item] of [["A1", a1], ["A2", a2], ["B1", b1]]) {
  test(`${name} verifies with the production registry`, async () => {
    const result = await verifySpecialTrainingCredentialJson(item.json);
    assert.equal(result.valid, true);
    assert.equal(result.credentialType, "special-training");
    assert.equal(result.keyId, "k1_wVLoeV9NYjTi8BqZ-Ktx4-Z7jC1raOTURWSFeum-zfU");
    assert.deepEqual(result.verifiedPayload, item.value.signed.payload);
  });
}

test("special-training transport rejects malformed base64url and fatal UTF-8", async () => {
  for (const token of ["AA==", "AA A", "AA+", "A"]) {
    assert.equal((await verifySpecialTrainingCredentialToken(token)).reason, CREDENTIAL_REASON.INVALID_ENCODING);
  }
  const invalidUtf8 = encodeUnpaddedBase64Url(new Uint8Array([0xff, 0xfe]));
  assert.equal((await verifySpecialTrainingCredentialToken(invalidUtf8)).reason, CREDENTIAL_REASON.INVALID_ENCODING);
});

test("duplicate JSON keys are rejected at envelope and payload depth", async () => {
  const top = a1.json.replace('"signature":', '"signature": "duplicate", "signature":');
  const payload = a1.json.replace('"title": "Phase 4J 테스트 특별수련"', '"title": "중복", "title": "Phase 4J 테스트 특별수련"');
  assert.equal((await verifySpecialTrainingCredentialJson(top)).reason, CREDENTIAL_REASON.DUPLICATE_JSON_KEY);
  assert.equal((await verifySpecialTrainingCredentialJson(payload)).reason, CREDENTIAL_REASON.DUPLICATE_JSON_KEY);
});

test("exact payload fields, eventId, text, category, and date range are enforced", async () => {
  const cases = [];
  const extra = clone(a1.value); extra.signed.payload.extra = true; cases.push(extra);
  const missing = clone(a1.value); delete missing.signed.payload.instructor; cases.push(missing);
  const eventId = clone(a1.value); eventId.signed.payload.eventId = "st1_bad"; cases.push(eventId);
  const blankTitle = clone(a1.value); blankTitle.signed.payload.title = "   "; cases.push(blankTitle);
  const longTitle = clone(a1.value); longTitle.signed.payload.title = "가".repeat(201); cases.push(longTitle);
  const badUnicode = clone(a1.value); badUnicode.signed.payload.instructor = "\ud800"; cases.push(badUnicode);
  const category = clone(a1.value); category.signed.payload.category = "class"; cases.push(category);
  const start = clone(a1.value); start.signed.payload.startDate = "2026-02-30"; cases.push(start);
  const end = clone(a1.value); end.signed.payload.endDate = "2026-09-28"; cases.push(end);
  for (const changed of cases) {
    assert.equal((await verifyObject(changed)).reason, CREDENTIAL_REASON.INVALID_FIELD);
  }
});

test("other credential types and arbitrary unknown types fail closed", async () => {
  const promotion = clone(a1.value); promotion.signed.type = "promotion";
  const arbitrary = clone(a1.value); arbitrary.signed.type = "attendance";
  assert.equal((await verifyObject(promotion)).reason, CREDENTIAL_REASON.UNSUPPORTED_TYPE);
  assert.equal((await verifyCredentialJson(JSON.stringify(arbitrary))).reason, CREDENTIAL_REASON.UNSUPPORTED_TYPE);
});

test("unknown and blocked keys fail closed before trust", async () => {
  const unknown = clone(a1.value);
  unknown.signed.keyId = `k1_${encodeUnpaddedBase64Url(new Uint8Array(32))}`;
  assert.equal((await verifyObject(unknown)).reason, CREDENTIAL_REASON.UNKNOWN_KEY_ID);
  const entry = PRODUCTION_TRUSTED_KEY_REGISTRY[a1.value.signed.keyId];
  const blockedRegistry = { [entry.keyId]: { ...entry, status: "blocked" } };
  assert.equal((await verifySpecialTrainingCredentialJson(a1.json, { registry: blockedRegistry })).reason, CREDENTIAL_REASON.BLOCKED_KEY_ID);
});

test("tamper, invalid signature lengths, and DER wire encoding are rejected", async () => {
  const tampered = clone(a1.value); tampered.signed.payload.title = "변조";
  assert.equal((await verifyObject(tampered)).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
  for (const length of [63, 65]) {
    const changed = clone(a1.value);
    changed.signature = encodeUnpaddedBase64Url(new Uint8Array(length));
    assert.equal((await verifyObject(changed)).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
  }
  const der = clone(a1.value);
  der.signature = encodeUnpaddedBase64Url(new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]));
  assert.equal((await verifyObject(der)).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
});

test("token round-trip verifies and the common verifier remains DB-side-effect free", async () => {
  assert.equal((await verifySpecialTrainingCredentialToken(encodeCredentialTransportJson(a1.json))).valid, true);
  const source = await readFile(new URL("../app/credential/credential-verifier.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|derEcdsaSignatureToFixedWidth/);
});
