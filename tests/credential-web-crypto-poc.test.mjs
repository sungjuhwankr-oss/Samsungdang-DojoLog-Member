import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ANDROID_KEYSTORE_POC_PHASE,
  ANDROID_KEYSTORE_POC_SCHEMA,
  ANDROID_KEYSTORE_POC_SCHEMA_VERSION,
  ANDROID_KEYSTORE_POC_STATUS,
  bytesEqual,
  decodeUnpaddedBase64Url,
  derEcdsaSignatureToFixedWidth,
  importP256Spki,
  verifyAndroidKeystorePocVector
} from "../app/poc/credential-verify/web-crypto-poc.mjs";
import { getCurrentMembershipFeatureGate } from "../app/membership-gate.mjs";
import { TRAINING_DB_VERSION } from "../app/training-records.mjs";

const fixtureUrl = new URL(
  "../app/poc/credential-verify/fixtures/android-keystore-4g-a2-public-test-vector.json",
  import.meta.url
);
const fixtureBytes = await readFile(fixtureUrl);
const fixture = JSON.parse(fixtureBytes.toString("utf8"));
const verification = verifyAndroidKeystorePocVector(fixture);

test("A2 public fixture bytes and identity match the Fold8 export", () => {
  assert.equal(
    createHash("sha256").update(fixtureBytes).digest("hex"),
    "e2a1242763d063aac8c58842a648e511c3af23d9b0925840c6174a5a096ee76f"
  );
  assert.equal(fixture.schema, ANDROID_KEYSTORE_POC_SCHEMA);
  assert.equal(fixture.schemaVersion, ANDROID_KEYSTORE_POC_SCHEMA_VERSION);
  assert.equal(fixture.pocPhase, ANDROID_KEYSTORE_POC_PHASE);
  assert.equal(fixture.pocStatus, ANDROID_KEYSTORE_POC_STATUS);
  assert.equal(fixture.inputUtf8ByteLength, 70);
  assert.equal(fixture.publicKeyByteLength, 91);
  assert.equal(fixture.signatureByteLength, 70);
  assert.equal(fixture.privateKeyEncodedIsNull, true);
});

test("unpadded base64url decoder reproduces the A2 byte lengths", () => {
  assert.equal(decodeUnpaddedBase64Url(fixture.inputUtf8Base64Url).byteLength, 70);
  assert.equal(decodeUnpaddedBase64Url(fixture.publicKeyBase64Url).byteLength, 91);
  assert.equal(decodeUnpaddedBase64Url(fixture.signatureBase64Url).byteLength, 70);
});

test("base64url decoder rejects padding, non-URL-safe characters, and malformed length", () => {
  assert.throws(() => decodeUnpaddedBase64Url("AA=="), /unpadded/);
  assert.throws(() => decodeUnpaddedBase64Url("AA+"), /URL-safe/);
  assert.throws(() => decodeUnpaddedBase64Url("A"), /invalid length/);
});

test("TextEncoder Korean UTF-8 bytes are byte-for-byte identical to A2", () => {
  const encoded = new TextEncoder().encode(fixture.inputText);
  const exported = decodeUnpaddedBase64Url(fixture.inputUtf8Base64Url);
  assert.equal(encoded.byteLength, 70);
  assert.equal(bytesEqual(encoded, exported), true);
});

test("A2 91-byte X.509 public key imports as non-extractable ECDSA P-256 SPKI", async () => {
  const publicKey = await importP256Spki(decodeUnpaddedBase64Url(fixture.publicKeyBase64Url));
  assert.equal(publicKey.type, "public");
  assert.equal(publicKey.extractable, false);
  assert.deepEqual(publicKey.usages, ["verify"]);
  assert.equal(publicKey.algorithm.name, "ECDSA");
  assert.equal(publicKey.algorithm.namedCurve, "P-256");
});

test("A2 Android DER signature converts to fixed-width P-256 r||s", () => {
  const fixedWidth = derEcdsaSignatureToFixedWidth(
    decodeUnpaddedBase64Url(fixture.signatureBase64Url)
  );
  assert.equal(fixedWidth.byteLength, 64);
  assert.notEqual(fixedWidth[0], undefined);
  assert.notEqual(fixedWidth[63], undefined);
});

test("DER adapter accepts a required positive INTEGER leading zero and left-pads scalars", () => {
  const fixedWidth = derEcdsaSignatureToFixedWidth(
    new Uint8Array([0x30, 0x07, 0x02, 0x02, 0x00, 0x80, 0x02, 0x01, 0x01])
  );
  assert.equal(fixedWidth.byteLength, 64);
  assert.equal(fixedWidth[31], 0x80);
  assert.equal(fixedWidth[63], 0x01);
});

test("DER adapter rejects malformed SEQUENCE and INTEGER lengths", () => {
  assert.throws(
    () => derEcdsaSignatureToFixedWidth(new Uint8Array([0x31, 0x00])),
    /SEQUENCE/
  );
  assert.throws(
    () => derEcdsaSignatureToFixedWidth(
      new Uint8Array([0x30, 0x07, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01])
    ),
    /SEQUENCE length/
  );
});

test("DER adapter rejects negative INTEGER scalars", () => {
  assert.throws(
    () => derEcdsaSignatureToFixedWidth(
      new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x80, 0x02, 0x01, 0x01])
    ),
    /negative/
  );
});

test("DER adapter rejects a P-256 scalar wider than 32 bytes", () => {
  const oversizedR = new Uint8Array(33).fill(0x01);
  const signature = new Uint8Array(40);
  signature.set([0x30, 0x26, 0x02, 0x21], 0);
  signature.set(oversizedR, 4);
  signature.set([0x02, 0x01, 0x01], 37);
  assert.throws(() => derEcdsaSignatureToFixedWidth(signature), /exceeds P-256 width/);
});

test("Node Web Crypto observes Android DER as non-verifying and verifies adapted A2 signature", async () => {
  const result = await verification;
  assert.equal(result.signatureRepresentationObserved, "ASN.1 DER ECDSA");
  assert.equal(result.directDerVerifyPassed, false);
  assert.equal(result.directDerVerifyOutcome, "verify-false");
  assert.equal(result.signatureAdapterUsed, true);
  assert.equal(result.adaptedSignatureByteLength, 64);
  assert.equal(result.originalVerifyPassed, true);
});

test("A2 input byte tamper is rejected by actual Web Crypto verify", async () => {
  assert.equal((await verification).inputTamperRejected, true);
});

test("A2 fixed-width signature byte tamper is rejected by actual Web Crypto verify", async () => {
  assert.equal((await verification).signatureTamperRejected, true);
});

test("A2 SPKI public-key byte tamper is rejected at import or verify", async () => {
  const result = await verification;
  assert.equal(result.publicKeyTamperRejected, true);
  assert.match(result.publicKeyTamperOutcome, /^(expected-import-rejection:|verify-false$)/);
  assert.equal(result.overallPassed, true);
});

test("4G-B PoC remains outside the membership gate and IndexedDB schema", async () => {
  const gate = getCurrentMembershipFeatureGate();
  assert.equal(gate.hasValidMembershipCredential, false);
  assert.deepEqual(gate.enabledFeatures, []);
  assert.equal(TRAINING_DB_VERSION, 3);

  const pocSource = await readFile(
    new URL("../app/poc/credential-verify/web-crypto-poc.mjs", import.meta.url),
    "utf8"
  );
  const databaseSource = await readFile(
    new URL("../app/training-database.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(pocSource, /membership-gate|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(databaseSource, /credential|samsungdangMembership/);
});

test("4G-B route is unlinked and explicitly marked dev/test candidate-not-credential-v1", async () => {
  const page = await readFile(
    new URL("../app/poc/credential-verify/page.tsx", import.meta.url),
    "utf8"
  );
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Phase 4G-B Web Crypto Interoperability PoC/);
  assert.match(page, /dev\/test only/);
  assert.match(page, /candidate-not-credential-v1/);
  assert.doesNotMatch(home, /poc\/credential-verify/);
});
