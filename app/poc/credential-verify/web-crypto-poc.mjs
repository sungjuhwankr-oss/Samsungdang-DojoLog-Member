export const ANDROID_KEYSTORE_POC_SCHEMA =
  "samsungdang-dojolog-android-keystore-poc-test-vector";
export const ANDROID_KEYSTORE_POC_SCHEMA_VERSION = 1;
export const ANDROID_KEYSTORE_POC_PHASE = "4G-A2";
export const ANDROID_KEYSTORE_POC_STATUS = "candidate-not-credential-v1";

const ECDSA_P256_IMPORT_ALGORITHM = Object.freeze({
  name: "ECDSA",
  namedCurve: "P-256"
});
const ECDSA_SHA256_VERIFY_ALGORITHM = Object.freeze({
  name: "ECDSA",
  hash: "SHA-256"
});

function fail(message) {
  throw new TypeError(message);
}

function getWebCrypto() {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) fail("Web Crypto SubtleCrypto is unavailable");
  return crypto;
}

export function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function decodeUnpaddedBase64Url(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("base64url value must be a non-empty string");
  }
  if (value.includes("=") || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail("base64url value must be unpadded and URL-safe");
  }
  if (value.length % 4 === 1) fail("base64url value has an invalid length");

  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = standard.padEnd(standard.length + ((4 - standard.length % 4) % 4), "=");
  let binary;
  try {
    binary = globalThis.atob(padded);
  } catch {
    fail("base64url value could not be decoded");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readDerLength(bytes, offset, limit) {
  if (offset >= limit) fail("DER length is missing");
  const first = bytes[offset];
  if (first < 0x80) return { length: first, nextOffset: offset + 1 };
  if (first === 0x80) fail("DER indefinite length is not allowed");

  const count = first & 0x7f;
  if (count === 0 || count > 4 || offset + 1 + count > limit) {
    fail("DER long-form length is malformed");
  }
  if (bytes[offset + 1] === 0) fail("DER length is not minimally encoded");

  let length = 0;
  for (let index = 0; index < count; index += 1) {
    length = length * 256 + bytes[offset + 1 + index];
  }
  if (length < 0x80) fail("DER long-form length is not minimal");
  return { length, nextOffset: offset + 1 + count };
}

function readPositiveInteger(bytes, offset, limit, scalarByteLength, name) {
  if (offset >= limit || bytes[offset] !== 0x02) fail(`DER ${name} INTEGER is missing`);
  const { length, nextOffset } = readDerLength(bytes, offset + 1, limit);
  const end = nextOffset + length;
  if (length === 0 || end > limit) fail(`DER ${name} INTEGER length is malformed`);

  let valueOffset = nextOffset;
  let valueLength = length;
  if ((bytes[valueOffset] & 0x80) !== 0) fail(`DER ${name} INTEGER is negative`);
  if (bytes[valueOffset] === 0) {
    if (valueLength === 1) fail(`DER ${name} INTEGER must be non-zero`);
    if ((bytes[valueOffset + 1] & 0x80) === 0) {
      fail(`DER ${name} INTEGER has an unnecessary leading zero`);
    }
    valueOffset += 1;
    valueLength -= 1;
  }
  if (valueLength > scalarByteLength) fail(`DER ${name} INTEGER exceeds P-256 width`);

  let nonZero = false;
  for (let index = valueOffset; index < end; index += 1) {
    if (bytes[index] !== 0) nonZero = true;
  }
  if (!nonZero) fail(`DER ${name} INTEGER must be non-zero`);

  const scalar = new Uint8Array(scalarByteLength);
  scalar.set(bytes.subarray(valueOffset, end), scalarByteLength - valueLength);
  return { scalar, nextOffset: end };
}

export function derEcdsaSignatureToFixedWidth(signature, scalarByteLength = 32) {
  if (!(signature instanceof Uint8Array)) fail("DER signature must be a Uint8Array");
  if (!Number.isSafeInteger(scalarByteLength) || scalarByteLength <= 0) {
    fail("scalar byte length must be a positive integer");
  }
  if (signature.byteLength < 8 || signature[0] !== 0x30) {
    fail("DER ECDSA SEQUENCE is missing");
  }

  const sequence = readDerLength(signature, 1, signature.byteLength);
  const sequenceEnd = sequence.nextOffset + sequence.length;
  if (sequenceEnd !== signature.byteLength) fail("DER SEQUENCE length is malformed");

  const r = readPositiveInteger(
    signature,
    sequence.nextOffset,
    sequenceEnd,
    scalarByteLength,
    "r"
  );
  const s = readPositiveInteger(signature, r.nextOffset, sequenceEnd, scalarByteLength, "s");
  if (s.nextOffset !== sequenceEnd) fail("DER signature has trailing data");

  const fixedWidth = new Uint8Array(scalarByteLength * 2);
  fixedWidth.set(r.scalar, 0);
  fixedWidth.set(s.scalar, scalarByteLength);
  return fixedWidth;
}

export async function importP256Spki(publicKeyBytes) {
  return getWebCrypto().subtle.importKey(
    "spki",
    publicKeyBytes,
    ECDSA_P256_IMPORT_ALGORITHM,
    false,
    ["verify"]
  );
}

async function verifySignature(publicKey, signature, inputBytes) {
  return getWebCrypto().subtle.verify(
    ECDSA_SHA256_VERIFY_ALGORITHM,
    publicKey,
    signature,
    inputBytes
  );
}

function errorName(error) {
  return error && typeof error === "object" && "name" in error
    ? String(error.name)
    : "Error";
}

async function diagnoseDirectDer(publicKey, derSignature, inputBytes) {
  try {
    const verified = await verifySignature(publicKey, derSignature, inputBytes);
    return { verified, outcome: verified ? "verified" : "verify-false" };
  } catch (error) {
    return { verified: false, outcome: `verify-rejected:${errorName(error)}` };
  }
}

async function verifyPublicKeyTamper(publicKeyBytes, fixedWidthSignature, inputBytes) {
  const tamperedPublicKey = publicKeyBytes.slice();
  tamperedPublicKey[tamperedPublicKey.byteLength - 1] ^= 0x01;

  let publicKey;
  try {
    publicKey = await importP256Spki(tamperedPublicKey);
  } catch (error) {
    const name = errorName(error);
    const expectedRejection = name === "DataError" || name === "OperationError";
    return {
      rejected: expectedRejection,
      outcome: `${expectedRejection ? "expected" : "unexpected"}-import-rejection:${name}`
    };
  }

  try {
    const verified = await verifySignature(publicKey, fixedWidthSignature, inputBytes);
    return {
      rejected: verified === false,
      outcome: verified ? "unexpected-verify-true" : "verify-false"
    };
  } catch (error) {
    return {
      rejected: false,
      outcome: `unexpected-verify-error:${errorName(error)}`
    };
  }
}

function validateFixtureIdentity(fixture) {
  return fixture?.schema === ANDROID_KEYSTORE_POC_SCHEMA &&
    fixture?.schemaVersion === ANDROID_KEYSTORE_POC_SCHEMA_VERSION &&
    fixture?.pocPhase === ANDROID_KEYSTORE_POC_PHASE &&
    fixture?.pocStatus === ANDROID_KEYSTORE_POC_STATUS &&
    fixture?.inputUtf8ByteLength === 70 &&
    fixture?.publicKeyByteLength === 91 &&
    fixture?.signatureByteLength === 70 &&
    fixture?.privateKeyEncodedIsNull === true;
}

export async function verifyAndroidKeystorePocVector(fixture) {
  const crypto = globalThis.crypto;
  const webCryptoAvailable = Boolean(crypto?.subtle);
  if (!webCryptoAvailable) fail("Web Crypto SubtleCrypto is unavailable");

  const fixtureIdentityPassed = validateFixtureIdentity(fixture);
  if (!fixtureIdentityPassed) fail("4G-A2 fixture identity is invalid");

  const textEncoderBytes = new TextEncoder().encode(fixture.inputText);
  const fixtureInputBytes = decodeUnpaddedBase64Url(fixture.inputUtf8Base64Url);
  const publicKeyBytes = decodeUnpaddedBase64Url(fixture.publicKeyBase64Url);
  const androidSignatureBytes = decodeUnpaddedBase64Url(fixture.signatureBase64Url);

  const utf8BytesIdentical = bytesEqual(textEncoderBytes, fixtureInputBytes) &&
    textEncoderBytes.byteLength === fixture.inputUtf8ByteLength;
  const declaredLengthsIdentical = publicKeyBytes.byteLength === fixture.publicKeyByteLength &&
    androidSignatureBytes.byteLength === fixture.signatureByteLength;

  const fixedWidthSignature = derEcdsaSignatureToFixedWidth(androidSignatureBytes, 32);
  const publicKey = await importP256Spki(publicKeyBytes);
  const directDer = await diagnoseDirectDer(publicKey, androidSignatureBytes, textEncoderBytes);
  const originalVerifyPassed = await verifySignature(
    publicKey,
    fixedWidthSignature,
    textEncoderBytes
  );

  const tamperedInput = textEncoderBytes.slice();
  tamperedInput[tamperedInput.byteLength - 1] ^= 0x01;
  const inputTamperRejected = !(await verifySignature(
    publicKey,
    fixedWidthSignature,
    tamperedInput
  ));

  const tamperedSignature = fixedWidthSignature.slice();
  tamperedSignature[0] ^= 0x01;
  const signatureTamperRejected = !(await verifySignature(
    publicKey,
    tamperedSignature,
    textEncoderBytes
  ));

  const publicKeyTamper = await verifyPublicKeyTamper(
    publicKeyBytes,
    fixedWidthSignature,
    textEncoderBytes
  );

  const result = {
    webCryptoAvailable,
    fixtureSchema: fixture.schema,
    fixtureStatus: fixture.pocStatus,
    fixtureIdentityPassed,
    utf8BytesIdentical,
    spkiPublicKeyImportPassed: true,
    androidSignatureByteLength: androidSignatureBytes.byteLength,
    signatureRepresentationObserved: "ASN.1 DER ECDSA",
    directDerVerifyPassed: directDer.verified,
    directDerVerifyOutcome: directDer.outcome,
    signatureAdapterUsed: true,
    adaptedSignatureByteLength: fixedWidthSignature.byteLength,
    originalVerifyPassed,
    inputTamperRejected,
    signatureTamperRejected,
    publicKeyTamperRejected: publicKeyTamper.rejected,
    publicKeyTamperOutcome: publicKeyTamper.outcome,
    declaredLengthsIdentical
  };

  return Object.freeze({
    ...result,
    overallPassed: Object.values({
      webCryptoAvailable,
      fixtureIdentityPassed,
      utf8BytesIdentical,
      spkiPublicKeyImportPassed: true,
      originalVerifyPassed,
      inputTamperRejected,
      signatureTamperRejected,
      publicKeyTamperRejected: publicKeyTamper.rejected,
      declaredLengthsIdentical,
      adaptedSignatureIsP256Width: fixedWidthSignature.byteLength === 64
    }).every(Boolean)
  });
}
