import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("production onboarding route uses bundle query, full preview, explicit confirm, and mutation-free cancel", async () => {
  const [page, panel, verifier] = await Promise.all([
    read("../app/onboarding/page.tsx"),
    read("../app/components/onboarding-registration-panel.tsx"),
    read("../app/credential/onboarding-verifier.mjs")
  ]);
  assert.match(page, /OnboardingRegistrationPanel/);
  assert.match(verifier, /getAll\("bundle"\)/);
  assert.match(panel, /Verified prior rank history/);
  assert.match(panel, /Kata reference baseline/);
  assert.match(panel, /명시적으로 확인하고 일괄 등록/);
  assert.match(panel, /replaceState/);
  assert.doesNotMatch(panel.match(/function cancel\(\)[\s\S]*?\n  }/)?.[0] ?? "", /register|update|put|add/);
});

test("onboarding route is available to B and A without a membership boundary", async () => {
  const [navigation, page] = await Promise.all([
    read("../app/components/app-navigation.tsx"), read("../app/onboarding/page.tsx")
  ]);
  assert.match(navigation, /href="\/onboarding\/"/);
  assert.doesNotMatch(page, /SamsungdangFeatureBoundary|MEMBERSHIP_CARD|TRAINING_PROGRESS/);
});

test("service worker precaches and directly falls back to onboarding route", async () => {
  const source = await read("../public/sw.js");
  assert.match(source, /"\.\/onboarding\/"/);
  assert.match(source, /endsWith\("\/onboarding\/"\)/);
  assert.match(source, /caches\.match\(scoped\("\.\/onboarding\/"\)\)/);
});

test("Backup v1 UI discloses all v6 exclusions, same-device preservation, and Phase 4L", async () => {
  const source = await read("../app/components/backup-restore-panel.tsx");
  for (const text of ["Membership/onboarding identity", "onboarding verified rank", "baseline/current/history", "event memo", "Phase 4L Backup v2", "열거나 지우지 않습니다"]) {
    assert.match(source, new RegExp(text.replace("/", "\\/")));
  }
});

test("Phase 4K-D behavior remains absent while its four physical stores exist", async () => {
  const [database, navigation] = await Promise.all([
    read("../app/training-database.mjs"), read("../app/components/app-navigation.tsx")
  ]);
  for (const name of ["EVENT_PARTICIPATION_STORE", "EVENT_CHANGE_HISTORY_STORE", "EXTERNAL_EVENT_STORE", "EVENT_MEMO_STORE"]) assert.match(database, new RegExp(name));
  assert.doesNotMatch(navigation, /special-training-v2|external-event-create|event-memo-editor/);
});
