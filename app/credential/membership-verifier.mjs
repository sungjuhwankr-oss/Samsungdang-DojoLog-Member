import { canonicalize as jcsCanonicalize } from "json-canonicalize";

import { decodeUnpaddedBase64Url, encodeUnpaddedBase64Url } from "./base64url.mjs";
import { DuplicateJsonKeyError, assertNoDuplicateJsonKeys } from "./strict-json.mjs";
import {
  PRODUCTION_TRUSTED_KEY_REGISTRY,
  TRUSTED_KEY_STATUS
} from "./trusted-key-registry.mjs";

export const CREDENTIAL_REASON = Object.freeze({
  OK: "OK",
  MALFORMED: "MALFORMED",
  DUPLICATE_JSON_KEY: "DUPLICATE_JSON_KEY",
  UNSUPPORTED_SCHEMA: "UNSUPPORTED_SCHEMA",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  UNSUPPORTED_TYPE: "UNSUPPORTED_TYPE",
  INVALID_FIELD: "INVALID_FIELD",
  INVALID_ENCODING: "INVALID_ENCODING",
  UNKNOWN_KEY_ID: "UNKNOWN_KEY_ID",
  BLOCKED_KEY_ID: "BLOCKED_KEY_ID",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  CANONICALIZATION_ERROR: "CANONICALIZATION_ERROR"
});

const TOP_LEVEL_FIELDS = ["signed", "signature"];
const SIGNED_FIELDS = [
  "schema",
  "credentialVersion",
  "issuer",
  "type",
  "credentialId",
  "keyId",
  "issuedAt",
  "payload"
];
const MEMBERSHIP_FIELDS = ["name", "memberId", "joinedAt"];
const KEY_STATUSES = new Set(Object.values(TRUSTED_KEY_STATUS));

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function result(reason, details = {}) {
  return Object.freeze({
    valid: reason === CREDENTIAL_REASON.OK,
    reason,
    credentialType: null,
    keyId: null,
    credentialId: null,
    verifiedPayload: null,
    ...details
  });
}

function hasExactFields(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((field, index) => field === required[index]);
}

function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isUtcSecondInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().replace(".000Z", "Z") === value;
}

function hasBinaryIdentifier(value, prefix, byteLength) {
  if (typeof value !== "string" || !value.startsWith(prefix)) return false;
  try {
    return decodeUnpaddedBase64Url(value.slice(prefix.length)).byteLength === byteLength;
  } catch {
    return false;
  }
}

function validateFields(envelope) {
  if (!hasExactFields(envelope, TOP_LEVEL_FIELDS) || typeof envelope.signature !== "string") {
    return CREDENTIAL_REASON.INVALID_FIELD;
  }
  const signed = envelope.signed;
  if (!hasExactFields(signed, SIGNED_FIELDS)) return CREDENTIAL_REASON.INVALID_FIELD;
  if (signed.schema !== "samsungdang-dojolog-credential") return CREDENTIAL_REASON.UNSUPPORTED_SCHEMA;
  if (signed.credentialVersion !== 1) return CREDENTIAL_REASON.UNSUPPORTED_VERSION;
  if (signed.issuer !== "aikido-samsungdang") return CREDENTIAL_REASON.INVALID_FIELD;
  if (signed.type !== "membership") return CREDENTIAL_REASON.UNSUPPORTED_TYPE;
  if (!hasBinaryIdentifier(signed.credentialId, "c1_", 16)) return CREDENTIAL_REASON.INVALID_FIELD;
  if (!hasBinaryIdentifier(signed.keyId, "k1_", 32)) return CREDENTIAL_REASON.INVALID_FIELD;
  if (!isUtcSecondInstant(signed.issuedAt)) return CREDENTIAL_REASON.INVALID_FIELD;
  if (!hasExactFields(signed.payload, MEMBERSHIP_FIELDS)) return CREDENTIAL_REASON.INVALID_FIELD;
  const { name, memberId, joinedAt } = signed.payload;
  if (typeof name !== "string" || name.trim().length === 0 || !isWellFormedUnicode(name)) {
    return CREDENTIAL_REASON.INVALID_FIELD;
  }
  if (typeof memberId !== "string" || !/^ASD-[0-9]{3,}$/u.test(memberId)) {
    return CREDENTIAL_REASON.INVALID_FIELD;
  }
  if (!isCalendarDate(joinedAt)) return CREDENTIAL_REASON.INVALID_FIELD;
  return null;
}

function webCrypto(options) {
  const value = options.crypto ?? globalThis.crypto;
  if (!value?.subtle) throw new TypeError("Web Crypto SubtleCrypto is unavailable");
  return value;
}

export function decodeCredentialTransportToken(token) {
  const bytes = decodeUnpaddedBase64Url(token);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new TypeError("credential token is not valid UTF-8");
  }
}

export function encodeCredentialTransportJson(envelopeJson) {
  if (typeof envelopeJson !== "string") throw new TypeError("credential envelope must be text");
  return encodeUnpaddedBase64Url(new TextEncoder().encode(envelopeJson));
}

export function parseCredentialTokenFromSearch(search) {
  const parameters = new URLSearchParams(search);
  const tokens = parameters.getAll("credential");
  if (tokens.length !== 1 || tokens[0].length === 0) {
    return result(CREDENTIAL_REASON.MALFORMED);
  }
  return Object.freeze({ valid: true, reason: CREDENTIAL_REASON.OK, token: tokens[0] });
}

export async function calculateKeyIdFromSpki(spkiBytes, options = {}) {
  const digest = await webCrypto(options).subtle.digest("SHA-256", spkiBytes);
  return `k1_${encodeUnpaddedBase64Url(new Uint8Array(digest))}`;
}

export async function verifyMembershipCredentialJson(envelopeJson, options = {}) {
  let envelope;
  try {
    assertNoDuplicateJsonKeys(envelopeJson);
    envelope = JSON.parse(envelopeJson);
  } catch (error) {
    return result(error instanceof DuplicateJsonKeyError
      ? CREDENTIAL_REASON.DUPLICATE_JSON_KEY
      : CREDENTIAL_REASON.MALFORMED);
  }

  const fieldFailure = validateFields(envelope);
  const identity = isObject(envelope?.signed) ? {
    credentialType: typeof envelope.signed.type === "string" ? envelope.signed.type : null,
    keyId: typeof envelope.signed.keyId === "string" ? envelope.signed.keyId : null,
    credentialId: typeof envelope.signed.credentialId === "string" ? envelope.signed.credentialId : null
  } : {};
  if (fieldFailure) return result(fieldFailure, identity);

  const registry = options.registry ?? PRODUCTION_TRUSTED_KEY_REGISTRY;
  const entry = registry[envelope.signed.keyId];
  if (!entry) return result(CREDENTIAL_REASON.UNKNOWN_KEY_ID, identity);
  if (entry.status === TRUSTED_KEY_STATUS.BLOCKED) {
    return result(CREDENTIAL_REASON.BLOCKED_KEY_ID, identity);
  }
  if (!KEY_STATUSES.has(entry.status) || entry.keyId !== envelope.signed.keyId) {
    return result(CREDENTIAL_REASON.INVALID_FIELD, identity);
  }

  let canonicalText;
  try {
    canonicalText = (options.canonicalize ?? jcsCanonicalize)(envelope.signed);
    if (typeof canonicalText !== "string") throw new TypeError("JCS output must be text");
  } catch {
    return result(CREDENTIAL_REASON.CANONICALIZATION_ERROR, identity);
  }

  let signatureBytes;
  let spkiBytes;
  try {
    signatureBytes = decodeUnpaddedBase64Url(envelope.signature);
    spkiBytes = decodeUnpaddedBase64Url(entry.publicKeySpkiBase64Url);
  } catch {
    return result(CREDENTIAL_REASON.INVALID_ENCODING, identity);
  }
  if (signatureBytes.byteLength !== 64) return result(CREDENTIAL_REASON.INVALID_SIGNATURE, identity);

  try {
    if (await calculateKeyIdFromSpki(spkiBytes, options) !== entry.keyId) {
      return result(CREDENTIAL_REASON.INVALID_FIELD, identity);
    }
    const crypto = webCrypto(options);
    const publicKey = await crypto.subtle.importKey(
      "spki",
      spkiBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signatureBytes,
      new TextEncoder().encode(canonicalText)
    );
    if (!verified) return result(CREDENTIAL_REASON.INVALID_SIGNATURE, identity);
  } catch {
    return result(CREDENTIAL_REASON.INVALID_SIGNATURE, identity);
  }

  return result(CREDENTIAL_REASON.OK, {
    ...identity,
    verifiedPayload: Object.freeze({ ...envelope.signed.payload }),
    envelopeJson
  });
}

export async function verifyMembershipCredentialToken(token, options = {}) {
  let envelopeJson;
  try {
    envelopeJson = decodeCredentialTransportToken(token);
  } catch {
    return result(CREDENTIAL_REASON.INVALID_ENCODING);
  }
  return verifyMembershipCredentialJson(envelopeJson, options);
}
