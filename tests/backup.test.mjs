import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  MAX_BACKUP_FILE_BYTES,
  createBackup,
  createMemoryBackupRepository,
  parseBackupText,
  replaceRepositoryFromBackup,
  validateBackupFileSize
} from "../app/backup.mjs";
import { deriveCurrentRank } from "../app/member-data.mjs";

const exportedAt = "2026-09-14T08:00:00.000Z";
const sample = {
  memberProfile: [{
    id: "self",
    name: "성주환",
    memberNo: null,
    joinDate: null
  }],
  promotionHistory: [
    { id: "p1", rankType: "kyu", rankValue: 8, date: null, order: 1 },
    { id: "p2", rankType: "kyu", rankValue: 7, date: "2026-07-11", order: 2 }
  ],
  trainingSession: [{
    dojo: "samsungdang",
    sessionNo: 1042,
    date: "2026-09-13",
    importedAt: "2026-09-13T10:00:00.000Z",
    sourceSchema: "samsungdang-dojolog-session",
    sourceVersion: 1
  }],
  sessionKata: [{
    dojo: "samsungdang",
    sessionNo: 1042,
    kataId: "뒤양손잡기-허리던지기",
    kataName: "뒤양손잡기 허리던지기",
    order: 0
  }]
};

function backup(overrides = {}) {
  return {
    ...createBackup(sample, exportedAt),
    ...overrides
  };
}

function data(overrides = {}) {
  return {
    ...structuredClone(sample),
    ...overrides
  };
}

test("empty DB backup", () => {
  const result = createBackup({
    memberProfile: [],
    promotionHistory: [],
    trainingSession: [],
    sessionKata: []
  }, exportedAt);
  assert.equal(result.schema, BACKUP_SCHEMA);
  assert.equal(result.version, BACKUP_VERSION);
  assert.deepEqual(result.data, {
    memberProfile: [],
    promotionHistory: [],
    trainingSession: [],
    sessionKata: []
  });
});

test("Backup v1 generated on DB v4 includes current database metadata", () => {
  const result = createBackup(sample, exportedAt);
  assert.deepEqual(result.database, {
    name: "samsungdang-dojolog-member",
    version: 4
  });
  assert.equal(result.data.trainingSession[0].sessionNo, 1042);
});

test("memberProfile null fields are preserved", () => {
  const result = parseBackupText(JSON.stringify(backup()));
  assert.equal(result.data.memberProfile[0].memberNo, null);
  assert.equal(result.data.memberProfile[0].joinDate, null);
});

test("promotion null date is preserved", () => {
  const result = parseBackupText(JSON.stringify(backup()));
  assert.equal(result.data.promotionHistory[0].date, null);
});

test("trainingSession is preserved", () => {
  const result = parseBackupText(JSON.stringify(backup()));
  assert.deepEqual(result.data.trainingSession, sample.trainingSession);
});

test("sessionKata id, name, and order are preserved", () => {
  const kata = parseBackupText(JSON.stringify(backup())).data.sessionKata[0];
  assert.deepEqual(
    { id: kata.kataId, name: kata.kataName, order: kata.order },
    {
      id: "뒤양손잡기-허리던지기",
      name: "뒤양손잡기 허리던지기",
      order: 0
    }
  );
});

test("backup data shape is deterministic", () => {
  const shuffled = data({
    promotionHistory: [...sample.promotionHistory].reverse()
  });
  const first = createBackup(shuffled, exportedAt);
  const second = createBackup(sample, exportedAt);
  assert.deepEqual(first, second);
});

test("valid backup v1", () => {
  const result = parseBackupText(JSON.stringify(backup()));
  assert.equal(result.schema, BACKUP_SCHEMA);
  assert.equal(result.data.trainingSession.length, 1);
});

test("malformed JSON is rejected", () => {
  assert.throws(() => parseBackupText("{"), { code: "invalid-json" });
});

test("wrong schema is rejected", () => {
  assert.throws(
    () => parseBackupText(JSON.stringify(backup({ schema: "wrong" }))),
    { code: "invalid-schema" }
  );
});

test("unsupported backup version is rejected", () => {
  assert.throws(
    () => parseBackupText(JSON.stringify(backup({ version: 2 }))),
    { code: "unsupported-version" }
  );
});

test("Session Share Payload is rejected as backup", () => {
  assert.throws(
    () => parseBackupText(JSON.stringify({
      schema: "samsungdang-dojolog-session",
      version: 1
    })),
    { code: "invalid-schema" }
  );
});

test("invalid exportedAt is rejected", () => {
  assert.throws(
    () => parseBackupText(JSON.stringify(backup({ exportedAt: "today" }))),
    { code: "invalid-exported-at" }
  );
});

test("duplicate memberProfile is rejected", () => {
  const value = backup();
  value.data.memberProfile.push({ ...value.data.memberProfile[0] });
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "invalid-member-profile"
  });
});

test("duplicate promotion id is rejected", () => {
  const value = backup();
  value.data.promotionHistory[1].id = "p1";
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "duplicate-promotion-id"
  });
});

test("duplicate promotion order is rejected", () => {
  const value = backup();
  value.data.promotionHistory[1].order = 1;
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "duplicate-promotion-order"
  });
});

test("invalid rankType is rejected", () => {
  const value = backup();
  value.data.promotionHistory[0].rankType = "grade";
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "invalid-promotion"
  });
});

test("rankValue zero is rejected", () => {
  const value = backup();
  value.data.promotionHistory[0].rankValue = 0;
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "invalid-promotion"
  });
});

test("invalid date is rejected", () => {
  const value = backup();
  value.data.trainingSession[0].date = "2026-02-30";
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "invalid-training-session"
  });
});

test("duplicate trainingSession key is rejected", () => {
  const value = backup();
  value.data.trainingSession.push({ ...value.data.trainingSession[0] });
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "duplicate-training-session"
  });
});

test("orphan sessionKata is rejected", () => {
  const value = backup();
  value.data.sessionKata[0].sessionNo = 9999;
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "orphan-session-kata"
  });
});

test("duplicate sessionKata key and order are rejected", () => {
  const value = backup();
  value.data.sessionKata.push({ ...value.data.sessionKata[0], kataId: "other" });
  assert.throws(() => parseBackupText(JSON.stringify(value)), {
    code: "duplicate-session-kata"
  });
});

test("oversized file is rejected before parsing", () => {
  assert.throws(() => validateBackupFileSize(MAX_BACKUP_FILE_BYTES + 1), {
    code: "file-too-large"
  });
});

test("restore success replaces the complete snapshot", async () => {
  const repository = createMemoryBackupRepository({
    memberProfile: [],
    promotionHistory: [],
    trainingSession: [],
    sessionKata: []
  });
  await replaceRepositoryFromBackup(repository, backup());
  assert.deepEqual(await repository.readAll(), sample);
});

test("restore failure preserves the existing snapshot", async () => {
  const existing = data({
    trainingSession: [{ ...sample.trainingSession[0], sessionNo: 1000 }],
    sessionKata: [{
      ...sample.sessionKata[0],
      sessionNo: 1000,
      kataId: "existing",
      kataName: "기존 기록"
    }]
  });
  const repository = createMemoryBackupRepository(existing, {
    failAfterStore: "promotionHistory"
  });
  await assert.rejects(() => replaceRepositoryFromBackup(repository, backup()));
  assert.deepEqual(await repository.readAll(), existing);
});

test("restore never leaves partial replacement", async () => {
  const existing = structuredClone(sample);
  const replacement = data({
    memberProfile: [{ ...sample.memberProfile[0], name: "변경" }]
  });
  const repository = createMemoryBackupRepository(existing, {
    failAfterStore: "trainingSession"
  });
  await assert.rejects(
    () => replaceRepositoryFromBackup(
      repository,
      createBackup(replacement, exportedAt)
    )
  );
  assert.deepEqual(await repository.readAll(), existing);
});

test("Phase 4A sample round trip is lossless", async () => {
  const originalBackup = createBackup(sample, exportedAt);
  const repository = createMemoryBackupRepository({
    memberProfile: [],
    promotionHistory: [],
    trainingSession: [],
    sessionKata: []
  });
  await replaceRepositoryFromBackup(repository, originalBackup);
  const restored = await repository.readAll();

  assert.deepEqual(restored, sample);
  assert.equal(restored.trainingSession[0].sessionNo, 1042);
  assert.equal(restored.trainingSession[0].date, "2026-09-13");
  assert.equal(restored.sessionKata[0].kataName, "뒤양손잡기 허리던지기");
  assert.equal(restored.promotionHistory[0].date, null);
  const currentRank = deriveCurrentRank(restored.promotionHistory);
  assert.equal(currentRank?.rankType, "kyu");
  assert.equal(currentRank?.rankValue, 7);
  assert.equal(currentRank?.label, "7급");
});
