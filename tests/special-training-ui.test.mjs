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

test("B and A share explicit confirm while v1 remains zero-session and cancel is mutation-free", async () => {
  const panel = await read("../app/components/special-training-registration-panel.tsx");
  assert.match(panel, /Special-training Credential입니다/);
  assert.match(panel, /assessment\.canConfirm &&/);
  assert.match(panel, /session 정보 없음/);
  assert.match(panel, /수련횟수는 0회/);
  assert.match(panel, /특별수련 이력 등록/);
  assert.match(panel, /등록 취소/);
  assert.match(panel, /window\.history\.replaceState/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});

test("events route provides unified participation, external-event, memo and history UX", async () => {
  const [events, manager] = await Promise.all([
    read("../app/events/page.tsx"),
    read("../app/components/event-manager.tsx")
  ]);
  assert.match(events, /<EventManager \/>/);
  assert.match(manager, /updateSpecialParticipation/);
  assert.match(manager, /createExternalEvent/);
  assert.match(manager, /updateExternalEvent/);
  assert.match(manager, /deleteExternalEvent/);
  assert.match(manager, /saveEventMemo/);
  assert.match(manager, /암호학적으로 검증된 출석 증명이 아닙니다/);
});

test("confirm rechecks identity and performs correction/archive/participation in one transaction", async () => {
  const store = await read("../app/special-training-store.mjs");
  assert.match(store, /SPECIAL_TRAINING_HISTORY_STORE,[\s\S]*EVENT_PARTICIPATION_STORE,[\s\S]*EVENT_CHANGE_HISTORY_STORE,[\s\S]*CREDENTIAL_ARCHIVE_STORE/);
  assert.match(store, /index\("byCredentialId"\)\.get/);
  assert.match(store, /store\.get\(verification\.verifiedPayload\.eventId\)/);
  assert.match(store, /store\.add\(record\)/);
  assert.match(store, /store\.put\(record\)/);
  assert.match(store, /domain: "special-training"/);
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
