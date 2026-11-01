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
  assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.SPECIAL_TRAINING_HISTORY), true);
});

test("production verifier의 valid member-onboarding 결과도 A 전용 기능 gate를 연다", () => {
  const gate = createMembershipFeatureGate({
    valid: true,
    reason: "OK",
    credentialType: "member-onboarding",
    keyId: "k1_verified",
    credentialId: "c1_verified",
    verifiedPayload: { name: "기존회원", memberId: "ASD-001", joinedAt: "2016-12-06" }
  });
  assert.equal(gate.hasValidMembershipCredential, true);
  for (const feature of Object.values(SAMSUNGDANG_FEATURE)) {
    assert.equal(allowsSamsungdangFeature(gate, feature), true, feature);
  }
});

test("invalid onboarding과 임의 credential type은 계속 B fail-closed 상태를 유지한다", () => {
  const valid = {
    valid: true, reason: "OK", credentialType: "member-onboarding",
    keyId: "k1_verified", credentialId: "c1_verified",
    verifiedPayload: { name: "기존회원", memberId: "ASD-001", joinedAt: "2016-12-06" }
  };
  for (const verification of [
    { ...valid, valid: false },
    { ...valid, reason: "INVALID_SIGNATURE" },
    { ...valid, credentialType: "promotion" },
    { ...valid, keyId: null },
    { ...valid, credentialId: null },
    { ...valid, verifiedPayload: null },
    { ...valid, verifiedPayload: undefined }
  ]) {
    const gate = createMembershipFeatureGate(verification);
    assert.equal(gate.hasValidMembershipCredential, false);
    assert.deepEqual(gate.enabledFeatures, []);
    assert.equal(allowsSamsungdangFeature(gate, SAMSUNGDANG_FEATURE.SESSION_SHARE_IMPORT), false);
  }
});

test("onboarding 변경 이벤트도 현재 gate를 재검증하고 구독 해제를 수행한다", async () => {
  const source = await readFile(new URL("../app/components/samsungdang-feature-boundary.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ ONBOARDING_CHANGED_EVENT \} from "\.\.\/onboarding-store\.mjs"/);
  assert.match(source, /window\.addEventListener\(ONBOARDING_CHANGED_EVENT, reload\)/);
  assert.match(source, /window\.removeEventListener\(ONBOARDING_CHANGED_EVENT, reload\)/);
  assert.match(source, /const reload = \(\) => \{\s*loadCurrentMembershipFeatureGate\(\)\.then/);
  assert.match(source, /window\.addEventListener\(MEMBERSHIP_CHANGED_EVENT, reload\)/);
});

test("Phase 4H-B gate는 저장 credential 검증결과를 사용하고 standalone mode를 사용하지 않는다", async () => {
  const source = await readFile(new URL("../app/membership-gate.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /indexedDB|localStorage|sessionStorage|standalone/);
  assert.match(source, /createMembershipFeatureGate\(null\)/);
  assert.match(source, /loadStoredMembershipVerification/);
});

test("B 수련 요약은 session·카타 집계 의미를 유지하고 수련일수 metric을 제거한다", () => {
  const summary = createTrainingSummary([
    { dojo: "__personal__", sessionNo: 1, date: "2026-09-20", kata: [{ id: "a", name: "A" }, { id: "a", name: "A" }] },
    { dojo: "__personal__", sessionNo: 2, date: "2026-09-20", kata: [] },
    { dojo: "__personal__", sessionNo: 3, date: "2026-09-21", kata: [{ id: "a", name: "A" }, { id: "b", name: "B" }] }
  ]);
  assert.equal("trainingDays" in summary, false);
  assert.equal(summary.trainingSessions, 3);
  assert.deepEqual(summary.trainingCounts.sources, { general: 3, special: 0, external: 0 });
  assert.deepEqual(summary.kata, [
    { id: "a", name: "A", count: 2 },
    { id: "b", name: "B", count: 1 }
  ]);
});

test("홈은 장문 component mount 대신 summary dashboard만 렌더링한다", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<Dashboard \/>/);
  assert.doesNotMatch(source, /TrainingLog|TrainingSummary|MemberPanel|BackupRestorePanel|SpecialTrainingHistory/);
});

test("import route는 gate 안에서만 payload preview를 렌더링한다", async () => {
  const source = await readFile(new URL("../app/import/page.tsx", import.meta.url), "utf8");
  assert.match(source, /SamsungdangFeatureBoundary/);
  assert.match(source, /SAMSUNGDANG_FEATURE\.SESSION_SHARE_IMPORT/);
  assert.match(source, /<FragmentProbe \/>/);
});

test("Phase 4K-C DB v6는 special-training과 membership store를 유지한다", async () => {
  const source = await readFile(new URL("../app/training-records.mjs", import.meta.url), "utf8");
  assert.match(source, /TRAINING_DB_VERSION = 6/);
  const database = await readFile(new URL("../app/training-database.mjs", import.meta.url), "utf8");
  assert.match(database, /SAMSUNGDANG_MEMBERSHIP_STORE/);
  assert.match(database, /SPECIAL_TRAINING_HISTORY_STORE/);
});
