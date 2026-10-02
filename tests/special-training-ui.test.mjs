import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production special-training route uses one credential token and verified preview", async () => {
  const [page, panel, verifier] = await Promise.all([
    read("../app/special-training/page.tsx"),
    read("../app/components/special-training-registration-panel.tsx"),
    read("../app/credential/credential-verifier.mjs")
  ]);
  assert.match(page, /SpecialTrainingRegistrationPanel/);
  assert.match(panel, /window\.location\.search/);
  assert.match(panel, /previewSpecialTrainingCredentialToken/);
  assert.match(verifier, /getAll\("credential"\)/);
  assert.match(verifier, /tokens\.length !== 1/);
});

test("B sees verified preview but confirm is assessment-gated and cancel is mutation-free", async () => {
  const panel = await read("../app/components/special-training-registration-panel.tsx");
  assert.match(panel, /Special-training Credential입니다/);
  assert.match(panel, /assessment\.canConfirm &&/);
  assert.match(panel, /Membership Credential 등록 필요/);
  assert.match(panel, /특별수련 이력 등록/);
  assert.match(panel, /등록 취소/);
  assert.match(panel, /window\.history\.replaceState/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});

test("events route reuses the existing verified special history as a read-only B/A shell", async () => {
  const [events, history] = await Promise.all([
    read("../app/events/page.tsx"),
    read("../app/components/special-training-history.tsx")
  ]);
  assert.match(events, /<SpecialTrainingHistory \/>/);
  assert.doesNotMatch(events, /SpecialTrainingRegistrationPanel|externalEvent|participantSession/);
  assert.match(events, /읽기 전용/);
  assert.match(history, /listVerifiedSpecialTrainingHistory/);
  assert.match(history, /SPECIAL_TRAINING_CHANGED_EVENT/);
  assert.doesNotMatch(history, /promotionHistory|trainingSession/);
});

test("confirm rechecks both eventId and credentialId in one readwrite transaction", async () => {
  const store = await read("../app/special-training-store.mjs");
  assert.match(store, /transaction\(SPECIAL_TRAINING_HISTORY_STORE, "readwrite"\)/);
  assert.match(store, /index\("byCredentialId"\)\.get/);
  assert.match(store, /store\.get\(verification\.verifiedPayload\.eventId\)/);
  assert.match(store, /store\.add\(record\)/);
  assert.doesNotMatch(store, /\.put\(record\)/);
});

test("service worker precaches and directly falls back to the special-training route", async () => {
  const serviceWorker = await read("../public/sw.js");
  assert.match(serviceWorker, /"\.\/special-training\/"/);
  assert.match(serviceWorker, /endsWith\("\/special-training\/"\)/);
  assert.match(serviceWorker, /caches\.match\(scoped\("\.\/special-training\/"\)\)/);
  assert.match(serviceWorker, /samsungdang-member-phase4k-c-v1/);
});

test("Backup v1 UI discloses exclusion, same-device preservation, and cross-device loss risk", async () => {
  const panel = await read("../app/components/backup-restore-panel.tsx");
  assert.match(panel, /특별수련 credential\/current\/archive/);
  assert.match(panel, /같은 기기에서 Backup v1을 복원하면 이 항목은 변경하지 않지만/);
  assert.match(panel, /새 브라우저·새 기기에서는 Backup v1만으로 복구할 수 없습니다/);
  assert.match(panel, /현재 기기의 .*특별수련 이력.*열거나 지우지 않습니다/);
});
