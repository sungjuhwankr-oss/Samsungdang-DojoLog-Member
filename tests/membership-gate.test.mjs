import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  allowsSamsungdangFeature,
  createMembershipFeatureGate,
  getCurrentMembershipFeatureGate,
  SAMSUNGDANG_FEATURE
} from "../app/membership-gate.mjs";
import { createTrainingSummary } from "../app/training-summary.mjs";

test("credential이 없으면 B 기본 gate는 모든 삼성당 전용 기능을 비활성화한다", () => {
  const gate = getCurrentMembershipFeatureGate();
  assert.equal(gate.hasValidMembershipCredential, false);
  assert.deepEqual(gate.enabledFeatures, []);
  assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.SESSION_SHARE_IMPORT), false);
  assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.TRAINING_PROGRESS), false);
});

test("invalid 결과는 삼성당 기능을 활성화하지 않는다", () => {
  const gate = createMembershipFeatureGate({ valid: false, credentialType: "membership", verifiedPayload: null });
  assert.equal(gate.hasValidMembershipCredential, false);
  assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.SESSION_SHARE_IMPORT), false);
});

test("production verifier의 valid membership 결과만 A 기능 gate를 연다", () => {
  const gate = createMembershipFeatureGate({
    valid: true,
    reason: "OK",
    credentialType: "membership",
    keyId: "k1_verified",
    credentialId: "c1_verified",
    verifiedPayload: { name: "검증", memberId: "ASD-001", joinedAt: "2026-01-01" }
  });
  assert.equal(gate.hasValidMembershipCredential, true);
  assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.SESSION_SHARE_IMPORT), true);
  assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.TRAINING_PROGRESS), true);
  assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.MEMBERSHIP_CARD), true);
});

test("Phase 4H-B gate는 저장 credential 검증결과를 사용하고 standalone mode를 사용하지 않는다", async () => {
  const source = await readFile(new URL("../app/membership-gate.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|standalone/);
  assert.match(source, /createMembershipFeatureGate\(null\)/);
  assert.match(source, /loadStoredMembershipVerification/);
});

test("B 수련 요약은 날짜·session·카타 집계의 기존 의미를 유지한다", () => {
  const summary = createTrainingSummary([
    { dojo: "__personal__", sessionNo: 1, date: "2026-09-20", kata: [{ id: "a", name: "A" }, { id: "a", name: "A" }] },
    { dojo: "__personal__", sessionNo: 2, date: "2026-09-20", kata: [] },
    { dojo: "__personal__", sessionNo: 3, date: "2026-09-21", kata: [{ id: "a", name: "A" }, { id: "b", name: "B" }] }
  ]);
  assert.equal(summary.trainingDays, 2);
  assert.equal(summary.trainingSessions, 3);
  assert.deepEqual(summary.kata, [
    { id: "a", name: "A", count: 2 },
    { id: "b", name: "B", count: 1 }
  ]);
});

test("B 기본 홈은 삼성당 전용 import와 심사 UI를 직접 노출하지 않는다", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /import 연결 테스트/);
  assert.doesNotMatch(source, /수련 진행과 심사 카타/);
  assert.match(source, /SamsungdangFeatureBoundary/);
  assert.match(source, /TrainingSummary/);
});

test("import route는 gate 안에서만 payload preview를 렌더링한다", async () => {
  const source = await readFile(new URL("../app/import/page.tsx", import.meta.url), "utf8");
  assert.match(source, /SamsungdangFeatureBoundary/);
  assert.match(source, /SAMSUNGDANG_FEATURE\.SESSION_SHARE_IMPORT/);
  assert.match(source, /<FragmentProbe \/>/);
});

test("Phase 4H-B는 DB v4의 dedicated membership store만 추가한다", async () => {
  const source = await readFile(new URL("../app/training-records.mjs", import.meta.url), "utf8");
  assert.match(source, /TRAINING_DB_VERSION = 4/);
  const database = await readFile(new URL("../app/training-database.mjs", import.meta.url), "utf8");
  assert.match(database, /SAMSUNGDANG_MEMBERSHIP_STORE/);
  assert.doesNotMatch(database, /specialTrainingHistory/);
});
