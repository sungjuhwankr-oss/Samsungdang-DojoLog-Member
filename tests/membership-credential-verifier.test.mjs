import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalize } from "json-canonicalize";

import {
  CREDENTIAL_REASON,
  calculateKeyIdFromSpki,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch,
  verifyMembershipCredentialJson,
  verifyMembershipCredentialToken
} from "../app/credential/membership-verifier.mjs";
import { encodeUnpaddedBase64Url } from "../app/credential/base64url.mjs";
import { PRODUCTION_TRUSTED_KEY_REGISTRY } from "../app/credential/trusted-key-registry.mjs";

const credentialUrl = new URL("./fixtures/membership-test-credential-v1.json", import.meta.url);
const bootstrapUrl = new URL("./fixtures/trusted-key-bootstrap-v1.json", import.meta.url);
const credentialBytes = await readFile(credentialUrl);
const bootstrapBytes = await readFile(bootstrapUrl);
const runtimeFixtureBytes = await readFile(new URL(
  "../app/poc/membership-credential-v1/fixtures/membership-test-credential-v1.json",
  import.meta.url
));
const credential = JSON.parse(credentialBytes.toString("utf8"));
const bootstrap = JSON.parse(bootstrapBytes.toString("utf8"));
const productionKey = PRODUCTION_TRUSTED_KEY_REGISTRY[bootstrap.keyId];

const clone = (value) => structuredClone(value);
const tokenFor = (value, spacing) => encodeCredentialTransportJson(
  typeof value === "string" ? value : JSON.stringify(value, null, spacing)
);
const verifyObject = (value, options) => verifyMembershipCredentialToken(tokenFor(value), options);

test("Phase 4H-A public handoff fixtures retain their exact SHA-256", () => {
  assert.equal(createHash("sha256").update(bootstrapBytes).digest("hex"), "46ce7378b1e075b804f0d63903a0cf312f852c128f94c768b20d9589b55d2312");
  assert.equal(createHash("sha256").update(credentialBytes).digest("hex"), "376ea76504eca6050bf48e058c7cd14a392703db46a161ee7b698671c61ffef9");
  assert.equal(createHash("sha256").update(runtimeFixtureBytes).digest("hex"), "376ea76504eca6050bf48e058c7cd14a392703db46a161ee7b698671c61ffef9");
});

test("production registry imports the 91-byte SPKI and independently derives the declared keyId", async () => {
  const bytes = Uint8Array.from(Buffer.from(bootstrap.publicKeySpkiBase64Url.replaceAll("-", "+").replaceAll("_", "/"), "base64"));
  assert.equal(bytes.byteLength, 91);
  assert.equal(await calculateKeyIdFromSpki(bytes), bootstrap.keyId);
  assert.deepEqual(productionKey, {
    keyId: bootstrap.keyId,
    publicKeySpkiBase64Url: bootstrap.publicKeySpkiBase64Url,
    status: "active"
  });
});

test("Phase 4H-A Membership Credential verifies through the production path", async () => {
  const result = await verifyObject(credential);
  assert.equal(result.valid, true);
  assert.equal(result.reason, CREDENTIAL_REASON.OK);
  assert.equal(result.credentialType, "membership");
  assert.equal(result.credentialId, credential.signed.credentialId);
  assert.deepEqual(result.verifiedPayload, credential.signed.payload);
});

test("active and verify-only trusted keys both verify", async () => {
  assert.equal((await verifyObject(credential)).valid, true);
  const registry = { [bootstrap.keyId]: { ...productionKey, status: "verify-only" } };
  assert.equal((await verifyObject(credential, { registry })).valid, true);
});

test("JCS makes signed property order and transport whitespace irrelevant", async () => {
  const reordered = {
    signed: {
      type: credential.signed.type,
      schema: credential.signed.schema,
      payload: {
        name: credential.signed.payload.name,
        memberId: credential.signed.payload.memberId,
        joinedAt: credential.signed.payload.joinedAt
      },
      keyId: credential.signed.keyId,
      issuer: credential.signed.issuer,
      issuedAt: credential.signed.issuedAt,
      credentialVersion: credential.signed.credentialVersion,
      credentialId: credential.signed.credentialId
    },
    signature: credential.signature
  };
  assert.equal((await verifyObject(reordered)).valid, true);
  assert.equal((await verifyMembershipCredentialJson(JSON.stringify(reordered, null, 4))).valid, true);
});

test("RFC 8785 number serialization vector is handled by the JCS dependency", () => {
  assert.equal(
    canonicalize({ numbers: [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001] }),
    '{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}'
  );
});

test("Korean UTF-8 verifies and NFC/NFD are not normalized into one value", async () => {
  assert.equal((await verifyObject(credential)).verifiedPayload.name, "테스트회원 (실제 회원 아님)");
  assert.notEqual(canonicalize({ value: "é" }), canonicalize({ value: "e\u0301" }));
});

test("query parser requires exactly one non-empty credential parameter", () => {
  assert.equal(parseCredentialTokenFromSearch("?credential=abc").token, "abc");
  assert.equal(parseCredentialTokenFromSearch("").reason, CREDENTIAL_REASON.MALFORMED);
  assert.equal(parseCredentialTokenFromSearch("?credential=").reason, CREDENTIAL_REASON.MALFORMED);
  assert.equal(parseCredentialTokenFromSearch("?credential=a&credential=b").reason, CREDENTIAL_REASON.MALFORMED);
});

for (const [name, token] of [
  ["padding", "AA=="],
  ["whitespace", "AA A"],
  ["non-base64url alphabet", "AA+"],
  ["malformed length", "A"]
]) {
  test(`transport rejects ${name}`, async () => {
    assert.equal((await verifyMembershipCredentialToken(token)).reason, CREDENTIAL_REASON.INVALID_ENCODING);
  });
}

test("transport rejects invalid UTF-8", async () => {
  const token = encodeUnpaddedBase64Url(new Uint8Array([0xff, 0xfe]));
  assert.equal((await verifyMembershipCredentialToken(token)).reason, CREDENTIAL_REASON.INVALID_ENCODING);
});

test("malformed JSON is rejected", async () => {
  assert.equal((await verifyMembershipCredentialJson("{")).reason, CREDENTIAL_REASON.MALFORMED);
});

test("duplicate keys are rejected at top-level, signed, and payload depth", async () => {
  const compact = JSON.stringify(credential);
  const top = compact.replace('"signature":', '"signature":"duplicate","signature":');
  const signed = compact.replace('"credentialVersion":1,', '"credentialVersion":1,"credentialVersion":1,');
  const payload = compact.replace('"joinedAt":"2026-09-21",', '"joinedAt":"2026-09-21","joinedAt":"2026-09-21",');
  for (const source of [top, signed, payload]) {
    assert.equal((await verifyMembershipCredentialJson(source)).reason, CREDENTIAL_REASON.DUPLICATE_JSON_KEY);
  }
});

test("missing, wrong-type, and unexpected fields are rejected", async () => {
  const missing = clone(credential); delete missing.signed.payload.name;
  const wrongType = clone(credential); wrongType.signed.payload.name = 42;
  const unexpected = clone(credential); unexpected.signed.payload.rank = "5dan";
  for (const value of [missing, wrongType, unexpected]) {
    assert.equal((await verifyObject(value)).reason, CREDENTIAL_REASON.INVALID_FIELD);
  }
});

test("unsupported schema, version, and type are fail-closed", async () => {
  const schema = clone(credential); schema.signed.schema = "other";
  const version = clone(credential); version.signed.credentialVersion = 2;
  const type = clone(credential); type.signed.type = "promotion";
  assert.equal((await verifyObject(schema)).reason, CREDENTIAL_REASON.UNSUPPORTED_SCHEMA);
  assert.equal((await verifyObject(version)).reason, CREDENTIAL_REASON.UNSUPPORTED_VERSION);
  assert.equal((await verifyObject(type)).reason, CREDENTIAL_REASON.UNSUPPORTED_TYPE);
});

test("credentialId, keyId, issuedAt, joinedAt, memberId, and Unicode fields are strict", async () => {
  const cases = [];
  const badCredentialId = clone(credential); badCredentialId.signed.credentialId = "c1_short"; cases.push(badCredentialId);
  const badKeyId = clone(credential); badKeyId.signed.keyId = "k1_short"; cases.push(badKeyId);
  const badInstant = clone(credential); badInstant.signed.issuedAt = "2026-09-21T09:49:00.000Z"; cases.push(badInstant);
  const badDate = clone(credential); badDate.signed.payload.joinedAt = "2026-02-30"; cases.push(badDate);
  const badMemberId = clone(credential); badMemberId.signed.payload.memberId = "000"; cases.push(badMemberId);
  const emptyName = clone(credential); emptyName.signed.payload.name = "   "; cases.push(emptyName);
  const loneSurrogate = clone(credential); loneSurrogate.signed.payload.name = "\ud800"; cases.push(loneSurrogate);
  for (const value of cases) {
    assert.equal((await verifyObject(value)).reason, CREDENTIAL_REASON.INVALID_FIELD);
  }
});

test("unknown and blocked keyIds are rejected before signature trust", async () => {
  const unknown = clone(credential);
  unknown.signed.keyId = `k1_${encodeUnpaddedBase64Url(new Uint8Array(32))}`;
  assert.equal((await verifyObject(unknown)).reason, CREDENTIAL_REASON.UNKNOWN_KEY_ID);
  const registry = { [bootstrap.keyId]: { ...productionKey, status: "blocked" } };
  assert.equal((await verifyObject(credential, { registry })).reason, CREDENTIAL_REASON.BLOCKED_KEY_ID);
});

test("registry keyId/SPKI mismatch and SPKI import failure fail closed", async () => {
  const mismatchRegistry = {
    [bootstrap.keyId]: { ...productionKey, publicKeySpkiBase64Url: encodeUnpaddedBase64Url(new Uint8Array(91)) }
  };
  assert.equal((await verifyObject(credential, { registry: mismatchRegistry })).reason, CREDENTIAL_REASON.INVALID_FIELD);

  const invalidSpki = new Uint8Array([1, 2, 3]);
  const invalidKeyId = await calculateKeyIdFromSpki(invalidSpki);
  const changed = clone(credential); changed.signed.keyId = invalidKeyId;
  const registry = { [invalidKeyId]: { keyId: invalidKeyId, publicKeySpkiBase64Url: encodeUnpaddedBase64Url(invalidSpki), status: "active" } };
  assert.equal((await verifyObject(changed, { registry })).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
});

test("signature wire accepts only fixed-width 64-byte r||s and rejects DER", async () => {
  const short = clone(credential); short.signature = encodeUnpaddedBase64Url(new Uint8Array(63));
  const long = clone(credential); long.signature = encodeUnpaddedBase64Url(new Uint8Array(65));
  const der = clone(credential); der.signature = encodeUnpaddedBase64Url(new Uint8Array([0x30, 0x06, 0x02, 0x01, 1, 0x02, 0x01, 1]));
  for (const value of [short, long, der]) {
    assert.equal((await verifyObject(value)).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
  }
});

test("signed, payload, and signature tampering are rejected", async () => {
  const signed = clone(credential); signed.signed.issuedAt = "2026-09-21T09:49:01Z";
  const payload = clone(credential); payload.signed.payload.name = "변조회원";
  const signature = clone(credential);
  const signatureBytes = Uint8Array.from(Buffer.from(signature.signature.replaceAll("-", "+").replaceAll("_", "/"), "base64"));
  signatureBytes[0] ^= 1;
  signature.signature = encodeUnpaddedBase64Url(signatureBytes);
  for (const value of [signed, payload, signature]) {
    assert.equal((await verifyObject(value)).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
  }
});

test("Web Crypto verify false and JCS failure produce stable reasons", async () => {
  const real = globalThis.crypto.subtle;
  const falseCrypto = {
    subtle: {
      digest: real.digest.bind(real),
      importKey: real.importKey.bind(real),
      verify: async () => false
    }
  };
  assert.equal((await verifyObject(credential, { crypto: falseCrypto })).reason, CREDENTIAL_REASON.INVALID_SIGNATURE);
  assert.equal((await verifyObject(credential, { canonicalize: () => { throw new Error("simulated"); } })).reason, CREDENTIAL_REASON.CANONICALIZATION_ERROR);
});

test("production verifier has no DB side effects and does not import the PoC DER adapter", async () => {
  const source = await readFile(new URL("../app/credential/membership-verifier.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|web-crypto-poc|derEcdsaSignatureToFixedWidth/);
});
