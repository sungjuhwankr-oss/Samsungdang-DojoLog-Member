import kataCatalog from "../../reference/kata-catalog.v2.json" with { type: "json" };

import { decodeUnpaddedBase64Url } from "./base64url.mjs";
import { CREDENTIAL_REASON, verifyCredentialJson } from "./credential-verifier.mjs";

export const ONBOARDING_INFLATED_LIMIT = 128 * 1024;
export const ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT = 2872;
const KATA_IDS = new Set(kataCatalog.kata.map(item => item.id));

function invalid(reason) {
  return Object.freeze({ valid: false, reason, credentialType: null, keyId: null, credentialId: null, verifiedPayload: null });
}

export function parseOnboardingBundleFromSearch(search) {
  const parameters = new URLSearchParams(search);
  const tokens = parameters.getAll("bundle");
  if (tokens.length !== 1 || tokens[0].length === 0) return invalid(CREDENTIAL_REASON.MALFORMED);
  if (tokens[0].length > ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT) return invalid(CREDENTIAL_REASON.INVALID_ENCODING);
  return Object.freeze({ valid: true, reason: CREDENTIAL_REASON.OK, token: tokens[0] });
}

async function gunzipBounded(bytes) {
  if (typeof DecompressionStream !== "function") throw new TypeError("gzip decompression is unavailable");
  if (bytes.byteLength < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8 || (bytes[3] & 0xe0) !== 0) {
    throw new TypeError("invalid gzip frame");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ONBOARDING_INFLATED_LIMIT) {
        await reader.cancel();
        throw new RangeError("inflated onboarding bundle exceeds 128 KiB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  const trailer = new DataView(bytes.buffer, bytes.byteOffset + bytes.byteLength - 8, 8);
  if (trailer.getUint32(0, true) !== crc32(output) || trailer.getUint32(4, true) !== (output.byteLength >>> 0)) {
    throw new TypeError("gzip trailer, trailing data, or checksum is invalid");
  }
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function decodeOnboardingTransportToken(token) {
  if (typeof token !== "string" || token.length === 0 || token.length > ONBOARDING_COMPRESSED_TOKEN_HARD_LIMIT) {
    throw new TypeError("invalid onboarding transport length");
  }
  let bytes;
  if (token.startsWith("gz1.")) {
    bytes = await gunzipBounded(decodeUnpaddedBase64Url(token.slice(4)));
  } else {
    bytes = decodeUnpaddedBase64Url(token);
    if (bytes.byteLength > ONBOARDING_INFLATED_LIMIT) throw new RangeError("onboarding bundle exceeds 128 KiB");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function verifyMemberOnboardingToken(token, options = {}) {
  let json;
  try {
    json = await decodeOnboardingTransportToken(token);
  } catch {
    return invalid(CREDENTIAL_REASON.INVALID_ENCODING);
  }
  return verifyMemberOnboardingJson(json, options);
}

export async function verifyMemberOnboardingJson(json, options = {}) {
  const verification = await verifyCredentialJson(json, { ...options, expectedType: "member-onboarding" });
  if (!verification.valid) return verification;
  if (verification.verifiedPayload.kataBaselines.some(item => !KATA_IDS.has(item.kataId))) {
    return invalid(CREDENTIAL_REASON.INVALID_FIELD);
  }
  return verification;
}
