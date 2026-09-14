import test from "node:test";
import assert from "node:assert/strict";

import {
  createMemoryTrainingRepository,
  saveTrainingSession
} from "../app/training-records.mjs";

const payload = {
  schema: "samsungdang-dojolog-session",
  version: 1,
  dojo: "samsungdang",
  sessionNo: 1042,
  date: "2026-09-13",
  kata: [
    { id: "뒤양손잡기-허리던지기", name: "뒤양손잡기 허리던지기" },
    { id: "정면타-입신던지기", name: "정면타 입신던지기" }
  ]
};

test("valid payload is saved as one session and ordered kata rows", async () => {
  const repository = createMemoryTrainingRepository();
  const result = await saveTrainingSession(repository, payload, "2026-09-14T00:00:00.000Z");
  assert.equal(result.status, "saved");
  assert.equal((await repository.list()).length, 1);
});

test("duplicate identity with the same date is blocked", async () => {
  const repository = createMemoryTrainingRepository();
  await saveTrainingSession(repository, payload, "2026-09-14T00:00:00.000Z");
  const result = await saveTrainingSession(repository, payload, "2026-09-14T00:01:00.000Z");
  assert.equal(result.status, "duplicate");
  assert.equal((await repository.list()).length, 1);
});

test("duplicate identity with a different date is rejected as conflict", async () => {
  const repository = createMemoryTrainingRepository();
  await saveTrainingSession(repository, payload, "2026-09-14T00:00:00.000Z");
  const result = await saveTrainingSession(
    repository,
    { ...payload, date: "2026-09-14" },
    "2026-09-14T00:01:00.000Z"
  );
  assert.equal(result.status, "conflict");
  assert.equal((await repository.list())[0].date, "2026-09-13");
});

test("kata id, name, and source order are preserved", async () => {
  const repository = createMemoryTrainingRepository();
  await saveTrainingSession(repository, payload, "2026-09-14T00:00:00.000Z");
  const [saved] = await repository.list();
  assert.deepEqual(
    saved.kata.map(({ id, name, order }) => ({ id, name, order })),
    [
      { id: "뒤양손잡기-허리던지기", name: "뒤양손잡기 허리던지기", order: 0 },
      { id: "정면타-입신던지기", name: "정면타 입신던지기", order: 1 }
    ]
  );
});

test("sessions are listed newest date first", async () => {
  const repository = createMemoryTrainingRepository();
  await saveTrainingSession(repository, payload, "2026-09-14T00:00:00.000Z");
  await saveTrainingSession(
    repository,
    { ...payload, sessionNo: 1043, date: "2026-09-14" },
    "2026-09-14T00:01:00.000Z"
  );
  assert.deepEqual(
    (await repository.list()).map((item) => item.sessionNo),
    [1043, 1042]
  );
});
