import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { encodeUnpaddedBase64Url } from "../app/credential/base64url.mjs";
import {
  CREDENTIAL_REASON,
  encodeCredentialTransportJson,
  verifyPromotionCredentialJson,
  verifyPromotionCredentialToken
} from "../app/credential/promotion-verifier.mjs";

const fixture = async (name) => {
  const bytes = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
  return { bytes, json: bytes.toString("utf8"), value: JSON.parse(bytes.toString("utf8")) };
};
const advance = await fixture("promotion-advance-one-test-credential-v1.json");
const target = await fixture("promotion-target-test-credential-v1.json");
const recognized = await fixture("promotion-recognized-at-entry-test-credential-v1.json");
const clone = (value) => structuredClone(value);
const verifyObject = (value, options) => verifyPromotionCredentialJson(JSON.stringify(value), options);

test("Phase 4I-A public Promotion fixtures retain their exact SHA-256", () => {
  assert.equal(createHash("sha256").update(advance.bytes).digest("hex"), "c07d46371be01d1a7ed18a4a60036e604798bff7344672b43f4fe0f6760638d8");
  assert.equal(createHash("sha256").update(target.bytes).digest("hex"), "5c551a77907dd1131a0348637316b677083c1e8df19919e4e618e168e6e88c0a");
  assert.equal(createHash("sha256").update(recognized.bytes).digest("hex"), "e5983d89c274bdda9a9118b3c88842b2debee75db5ebea35a6f8957c57d3cc07");
});

for (const [name, item] of [["advance-one", advance], ["target", target], ["recognized-at-entry", recognized]]) {
  test(`Phase 4I-A ${name} fixture verifies with the production registry`, async () => {
    const result = await verifyPromotionCredentialJson(item.json);
    assert.equal(result.valid, true);
    assert.equal(result.credentialType, "promotion");
    assert.equal(result.keyId, "k1_wVLoeV9NYjTi8BqZ-Ktx4-Z7jC1raOTURWSFeum-zfU");
    assert.deepEqual(result.verifiedPayload, item.value.signed.payload);
  });
}

test("promotion transport rejects malformed base64url and fatal UTF-8", async () => {
  for (const token of ["AA==", "AA A", "AA+", "A"]) {
    assert.equal((await verifyPromotionCredentialToken(token)).reason, CREDENTIAL_REASON.INVALID_ENCODING);
  }
  assert.equal(
    (await verifyPromotionCredentialToken(encodeUnpaddedBase64Url(new Uint8Array([0xff, 0xfe])))).reason,
    CREDENTIAL_REASON.INVALID_ENCODING
  );
});

test("promotion verifier rejects duplicate JSON keys", async () => {
  const duplicate = advance.json.replace('"mode": "advance-one"', '"mode": "advance-one", "mode": "advance-one"');
  assert.equal((await verifyPromotionCredentialJson(duplicate)).reason, CREDENTIAL_REASON.DUPLICATE_JSON_KEY);
});

test("wrong schema, version, type, and special-training fail closed", async () => {
  const schema = clone(advance.value); schema.signed.schema = "other";
  const version = clone(advance.value); version.signed.credentialVersion = 2;
  const membership = clone(advance.value); membership.signed.type = "membership";
  const special = clone(advance.value); special.signed.type = "special-training";
  assert.equal((await verifyObject(schema)).reason, CREDENTIAL_REASON.UNSUPPORTED_SCHEMA);
  assert.equal((await verifyObject(version)).reason, CREDENTIAL_REASON.UNSUPPORTED_VERSION);
  assert.equal((await verifyObject(membership)).reason, CREDENTIAL_REASON.UNSUPPORTED_TYPE);
  assert.equal((await verifyObject(special)).reason, CREDENTIAL_REASON.UNSUPPORTED_TYPE);
});

test("advance-one exact fields reject targetRank, identity, and unknown fields", async () => {
  for (const [field, value] of [["targetRank", { rankType: "kyu", rankValue: 5 }], ["memberId", "ASD-000"], ["currentRank", 7], ["extra", true]]) {
    const changed = clone(advance.value); changed.signed.payload[field] = value;
    assert.equal((await verifyObject(changed)).reason, CREDENTIAL_REASON.INVALID_FIELD);
  }
  const missing = clone(advance.value); delete missing.signed.payload.examDate;
  assert.equal((await verifyObject(missing)).reason, CREDENTIAL_REASON.INVALID_FIELD);
});

test("target exact fields and rank boundaries are enforced", async () => {
  const missing = clone(target.value); delete missing.signed.payload.targetRank;
  const extra = clone(target.value); extra.signed.payload.memberId = "ASD-000";
  const kyuZero = clone(target.value); kyuZero.signed.payload.targetRank.rankValue = 0;
  const kyuTen = clone(target.value); kyuTen.signed.payload.targetRank.rankValue = 10;
  const danZero = clone(target.value); danZero.signed.payload.targetRank = { rankType: "dan", rankValue: 0 };
  const danUnsafe = clone(target.value); danUnsafe.signed.payload.targetRank = { rankType: "dan", rankValue: Number.MAX_SAFE_INTEGER + 1 };
  for (const changed of [missing, extra, kyuZero, kyuTen, danZero, danUnsafe]) {
    assert.equal((await verifyObject(changed)).reason, CREDENTIAL_REASON.INVALID_FIELD);
  }
});

test("recognized-at-entry exact fields, memberId, dates, and ordering are enforced", async () => {
  const cases = [];
  const noMember = clone(recognized.value); delete noMember.signed.payload.memberId; cases.push(noMember);
  const extra = clone(recognized.value); extra.signed.payload.examDate = "2026-09-26"; cases.push(extra);
  const invalidRankDate = clone(recognized.value); invalidRankDate.signed.payload.rankDate = "2026-02-30"; cases.push(invalidRankDate);
  const invalidRecognized = clone(recognized.value); invalidRecognized.signed.payload.recognizedAt = "2026-02-30"; cases.push(invalidRecognized);
  const reversed = clone(recognized.value); reversed.signed.payload.rankDate = "2026-09-27"; cases.push(reversed);
  for (const changed of cases) assert.equal((await verifyObject(changed)).reason, CREDENTIAL_REASON.INVALID_FIELD);
  assert.equal((await verifyPromotionCredentialJson(recognized.json)).verifiedPayload.rankDate, null);
});

test("unknown key, signature tamper, and signed field tamper are rejected", async () => {
  const unknown = clone(advance.value);
  unknown.signed.keyId = `k1_${encodeUnpaddedBase64Url(new Uint8Array(32))}`;
  assert.equal((await verifyObject(unknown)).reason, CREDENTIAL_REASON.UNKNOWN_KEY_ID);

  const signature = clone(advance.value);
  const bytes = Uint8Array.from(Buffer.from(signature.signature.replaceAll("-", "+").replaceAll("_", "/"), "base64"));
  bytes[0] ^= 1;
  signature.signature = encodeUnpaddedBase64Url(bytes);
  assert.equal((await verifyObject(signature)).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);

  const signed = clone(advance.value); signed.signed.payload.examDate = "2026-09-27";
  assert.equal((await verifyObject(signed)).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
});

test("promotion token round-trips through the common canonical transport", async () => {
  const token = encodeCredentialTransportJson(advance.json);
  assert.equal((await verifyPromotionCredentialToken(token)).valid, true);
});

test("common production verifier remains side-effect free", async () => {
  const source = await readFile(new URL("../app/credential/credential-verifier.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|web-crypto-poc|derEcdsaSignatureToFixedWidth/);
});
