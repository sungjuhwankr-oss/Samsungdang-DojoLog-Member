function fail(message) {
  throw new TypeError(message);
}

export function encodeUnpaddedBase64Url(bytes) {
  if (!(bytes instanceof Uint8Array)) fail("base64url input must be a Uint8Array");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function decodeUnpaddedBase64Url(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("base64url value must be a non-empty string");
  }
  if (value.includes("=") || /\s/u.test(value) || !/^[A-Za-z0-9_-]+$/u.test(value)) {
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
  if (encodeUnpaddedBase64Url(bytes) !== value) fail("base64url value is not canonical");
  return bytes;
}
