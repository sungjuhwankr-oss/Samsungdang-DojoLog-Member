export const SESSION_SCHEMA = "samsungdang-dojolog-session";
export const SESSION_VERSION = 1;
export const SESSION_DOJO = "samsungdang";
export const MAX_FRAGMENT_LENGTH = 16_384;
export const MAX_DECODED_BYTES = 8_192;
export const MAX_KATA_COUNT = 50;
export const MAX_KATA_STRING_LENGTH = 200;

const messages = {
  "no-session": "session parameter가 없습니다.",
  "fragment-too-long": "session payload가 허용된 길이를 초과했습니다.",
  "invalid-base64url": "session payload가 올바른 base64url 형식이 아닙니다.",
  "decoded-too-large": "decode된 session payload가 허용된 크기를 초과했습니다.",
  "invalid-utf8": "session payload를 올바른 UTF-8 문자열로 해석할 수 없습니다.",
  "invalid-json": "session payload가 올바른 JSON이 아닙니다.",
  "invalid-schema": "지원하지 않는 session schema입니다.",
  "unsupported-version": "지원하지 않는 session payload version입니다.",
  "invalid-dojo": "Samsungdang session payload가 아닙니다.",
  "invalid-session-no": "수업번호는 양의 정수여야 합니다.",
  "invalid-date": "날짜는 실제로 존재하는 YYYY-MM-DD 형식이어야 합니다.",
  "invalid-kata-array": "kata는 1개 이상, 허용된 최대 개수 이하의 배열이어야 합니다.",
  "invalid-kata-item": "각 kata 항목의 id와 name은 비어 있지 않은 제한 길이 문자열이어야 합니다."
};

function failure(code) {
  return { ok: false, code, message: messages[code] };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidKataString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_KATA_STRING_LENGTH
  );
}

function decodeBase64Url(encoded) {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    return failure("invalid-base64url");
  }

  const paddingLength = (4 - (encoded.length % 4)) % 4;
  const estimatedBytes =
    ((encoded.length + paddingLength) * 3) / 4 - paddingLength;
  if (estimatedBytes > MAX_DECODED_BYTES) {
    return failure("decoded-too-large");
  }

  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(paddingLength);

  let binary;
  try {
    binary = atob(normalized);
  } catch {
    return failure("invalid-base64url");
  }

  if (binary.length > MAX_DECODED_BYTES) {
    return failure("decoded-too-large");
  }

  return {
    ok: true,
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0))
  };
}

function validatePayload(value) {
  if (!isPlainObject(value) || value.schema !== SESSION_SCHEMA) {
    return failure("invalid-schema");
  }

  if (value.version !== SESSION_VERSION) {
    return failure("unsupported-version");
  }

  if (value.dojo !== SESSION_DOJO) {
    return failure("invalid-dojo");
  }

  if (!Number.isSafeInteger(value.sessionNo) || value.sessionNo <= 0) {
    return failure("invalid-session-no");
  }

  if (!isValidDate(value.date)) {
    return failure("invalid-date");
  }

  if (
    !Array.isArray(value.kata) ||
    value.kata.length < 1 ||
    value.kata.length > MAX_KATA_COUNT
  ) {
    return failure("invalid-kata-array");
  }

  for (const item of value.kata) {
    if (
      !isPlainObject(item) ||
      !isValidKataString(item.id) ||
      !isValidKataString(item.name)
    ) {
      return failure("invalid-kata-item");
    }
  }

  return { ok: true, payload: value, warnings: [] };
}

export function parseSessionHash(hash) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!raw.startsWith("session=") || raw.length === "session=".length) {
    return failure("no-session");
  }

  const encoded = raw.slice("session=".length);
  if (encoded.length > MAX_FRAGMENT_LENGTH) {
    return failure("fragment-too-long");
  }

  const decoded = decodeBase64Url(encoded);
  if (!decoded.ok) {
    return decoded;
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(decoded.bytes);
  } catch {
    return failure("invalid-utf8");
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return failure("invalid-json");
  }

  return validatePayload(value);
}
