import { decodeUnpaddedBase64Url } from "./base64url.mjs";
import { CREDENTIAL_REASON, verifyCredentialJson } from "./credential-verifier.mjs";

export {
  CREDENTIAL_REASON,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";

export const SPECIAL_TRAINING_INFLATED_LIMIT = 128 * 1024;
export const SPECIAL_TRAINING_TOKEN_HARD_LIMIT = 2872;

function invalidEncoding() {
  return Object.freeze({
    valid: false,
    reason: CREDENTIAL_REASON.INVALID_ENCODING,
    credentialType: null,
    credentialVersion: null,
    keyId: null,
    credentialId: null,
    verifiedPayload: null
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function gunzipBounded(bytes) {
  if (typeof DecompressionStream !== "function") throw new TypeError("gzip decompression is unavailable");
  if (bytes.byteLength < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8 || (bytes[3] & 0xe0) !== 0) {
    throw new TypeError("invalid gzip frame");
  }
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SPECIAL_TRAINING_INFLATED_LIMIT) {
        await reader.cancel();
        throw new RangeError("inflated special-training credential exceeds 128 KiB");
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
    throw new TypeError("invalid gzip checksum or length");
  }
  return output;
}

export async function decodeSpecialTrainingTransportToken(token) {
  if (typeof token !== "string" || token.length === 0 || token.length > SPECIAL_TRAINING_TOKEN_HARD_LIMIT) {
    throw new TypeError("invalid special-training transport length");
  }
  let bytes;
  if (token.startsWith("gz1.")) {
    bytes = await gunzipBounded(decodeUnpaddedBase64Url(token.slice(4)));
  } else {
    bytes = decodeUnpaddedBase64Url(token);
    if (bytes.byteLength > SPECIAL_TRAINING_INFLATED_LIMIT) throw new RangeError("special-training credential exceeds 128 KiB");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function verifySpecialTrainingCredentialJson(envelopeJson, options = {}) {
  return verifyCredentialJson(envelopeJson, { ...options, expectedType: "special-training" });
}

export async function verifySpecialTrainingCredentialToken(token, options = {}) {
  let envelopeJson;
  try {
    envelopeJson = await decodeSpecialTrainingTransportToken(token);
  } catch {
    return invalidEncoding();
  }
  return verifySpecialTrainingCredentialJson(envelopeJson, options);
}
