import { TRAINING_DB_NAME, TRAINING_DB_VERSION } from "./training-records.mjs";

export const BACKUP_SCHEMA = "samsungdang-dojolog-member-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDS_PER_STORE = 100_000;

export class BackupValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BackupValidationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BackupValidationError(code, message);
}
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;
const positive = (value) => Number.isInteger(value) && value > 0;
const nonnegative = (value) => Number.isInteger(value) && value >= 0;
const clone = (value) => structuredClone(value);

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function validInstant(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}
function records(data, name) {
  const value = data[name];
  if (!Array.isArray(value) || value.length > MAX_RECORDS_PER_STORE) {
    fail("invalid-data", `${name} 데이터가 올바르지 않거나 너무 많습니다.`);
  }
  return value;
}
const sessionKey = (record) => `${record.dojo}\u0000${record.sessionNo}`;
const kataKey = (record) => `${sessionKey(record)}\u0000${record.order}`;

function validateProfiles(values) {
  if (values.length > 1) fail("invalid-member-profile", "내 정보는 최대 한 건이어야 합니다.");
  for (const value of values) {
    if (!object(value) || value.id !== "self" ||
      !(typeof value.name === "string" || value.name === null) ||
      !(typeof value.memberNo === "string" || value.memberNo === null) ||
      !(value.joinDate === null || validDate(value.joinDate))) {
      fail("invalid-member-profile", "내 정보 구조가 올바르지 않습니다.");
    }
  }
}
function validatePromotions(values) {
  const ids = new Set();
  const orders = new Set();
  for (const value of values) {
    if (!object(value) || !text(value.id) || !["kyu", "dan"].includes(value.rankType) ||
      !positive(value.rankValue) || !(value.date === null || validDate(value.date)) ||
      !positive(value.order)) {
      fail("invalid-promotion", "승급이력 구조가 올바르지 않습니다.");
    }
    if (ids.has(value.id)) fail("duplicate-promotion-id", "중복된 승급이력 id가 있습니다.");
    if (orders.has(value.order)) fail("duplicate-promotion-order", "중복된 승급 순서가 있습니다.");
    ids.add(value.id);
    orders.add(value.order);
  }
}
function validateSessions(values) {
  const keys = new Set();
  for (const value of values) {
    if (!object(value) || !text(value.dojo) || !positive(value.sessionNo) ||
      !validDate(value.date) || !validInstant(value.importedAt) ||
      !text(value.sourceSchema) || !positive(value.sourceVersion)) {
      fail("invalid-training-session", "수련기록 구조가 올바르지 않습니다.");
    }
    const key = sessionKey(value);
    if (keys.has(key)) fail("duplicate-training-session", "중복된 수련기록이 있습니다.");
    keys.add(key);
  }
  return keys;
}
function validateKata(values, parents) {
  const keys = new Set();
  for (const value of values) {
    if (!object(value) || !text(value.dojo) || !positive(value.sessionNo) ||
      !text(value.kataId) || !text(value.kataName) || !nonnegative(value.order)) {
      fail("invalid-session-kata", "수련내용 구조가 올바르지 않습니다.");
    }
    if (!parents.has(sessionKey(value))) fail("orphan-session-kata", "수업기록이 없는 수련내용이 있습니다.");
    const key = kataKey(value);
    if (keys.has(key)) fail("duplicate-session-kata", "중복된 수련내용 순서가 있습니다.");
    keys.add(key);
  }
}
function sortedData(data) {
  return {
    memberProfile: clone(data.memberProfile).sort((a, b) => a.id.localeCompare(b.id)),
    promotionHistory: clone(data.promotionHistory).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    trainingSession: clone(data.trainingSession).sort((a, b) => a.dojo.localeCompare(b.dojo) || a.sessionNo - b.sessionNo),
    sessionKata: clone(data.sessionKata).sort((a, b) => a.dojo.localeCompare(b.dojo) || a.sessionNo - b.sessionNo || a.order - b.order)
  };
}

export function validateBackupFileSize(size) {
  if (!Number.isFinite(size) || size < 0 || size > MAX_BACKUP_FILE_BYTES) {
    fail("file-too-large", "백업 파일은 10 MB 이하여야 합니다.");
  }
}
export function validateBackupObject(value) {
  if (!object(value) || value.schema !== BACKUP_SCHEMA) {
    fail("invalid-schema", "Samsungdang DojoLog 회원 백업 파일이 아닙니다.");
  }
  if (value.version !== BACKUP_VERSION) fail("unsupported-version", "지원하지 않는 백업 버전입니다.");
  if (!validInstant(value.exportedAt)) fail("invalid-exported-at", "백업 생성 시간이 올바르지 않습니다.");
  if (!object(value.database) || !object(value.data)) fail("invalid-data", "백업 데이터 구조가 올바르지 않습니다.");
  const data = {
    memberProfile: records(value.data, "memberProfile"),
    promotionHistory: records(value.data, "promotionHistory"),
    trainingSession: records(value.data, "trainingSession"),
    sessionKata: records(value.data, "sessionKata")
  };
  validateProfiles(data.memberProfile);
  validatePromotions(data.promotionHistory);
  validateKata(data.sessionKata, validateSessions(data.trainingSession));
  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: value.exportedAt,
    database: clone(value.database),
    data: sortedData(data)
  };
}
export function createBackup(data, exportedAt = new Date().toISOString()) {
  return validateBackupObject({
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt,
    database: { name: TRAINING_DB_NAME, version: TRAINING_DB_VERSION },
    data
  });
}
export function parseBackupText(value) {
  try {
    return validateBackupObject(JSON.parse(value));
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    fail("invalid-json", "JSON 파일을 읽을 수 없습니다.");
  }
}
export function createMemoryBackupRepository(initial, options = {}) {
  let snapshot = sortedData(initial);
  return {
    async readAll() {
      return clone(snapshot);
    },
    async replaceAll(next) {
      const staged = sortedData(next);
      for (const name of ["memberProfile", "promotionHistory", "trainingSession", "sessionKata"]) {
        if (options.failAfterStore === name) throw new Error("simulated restore failure");
      }
      snapshot = staged;
    }
  };
}
export async function replaceRepositoryFromBackup(repository, backup) {
  await repository.replaceAll(validateBackupObject(backup).data);
}

