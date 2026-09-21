import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production membership route uses one credential query token and verified preview", async () => {
  const [page, panel, verifier] = await Promise.all([
    read("../app/membership/page.tsx"),
    read("../app/components/membership-registration-panel.tsx"),
    read("../app/credential/membership-verifier.mjs")
  ]);
  assert.match(page, /MembershipRegistrationPanel/);
  assert.match(panel, /window\.location\.search/);
  assert.match(panel, /verifyMembershipCredentialToken/);
  assert.match(verifier, /getAll\("credential"\)/);
  assert.match(verifier, /tokens\.length !== 1/);
});

test("registration UI has explicit confirm and cancel with no preview-time persistence", async () => {
  const panel = await read("../app/components/membership-registration-panel.tsx");
  assert.match(panel, /회원정보 등록/);
  assert.match(panel, /등록 취소/);
  assert.match(panel, /registerMembershipCredentialToken\(token\)/);
  assert.match(panel, /function cancel\(\)/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});

test("invalid credential UI exposes only a reason code, not unverified identity fields", async () => {
  const panel = await read("../app/components/membership-registration-panel.tsx");
  const invalidBranch = panel.slice(panel.indexOf('state.kind === "invalid"'), panel.indexOf('state.kind === "cancelled"'));
  assert.match(invalidBranch, /state\.reason/);
  assert.doesNotMatch(invalidBranch, /payload|name|memberId|joinedAt/);
});

test("B home exposes the digital card only through the membership feature boundary", async () => {
  const home = await read("../app/page.tsx");
  assert.match(home, /SAMSUNGDANG_FEATURE\.MEMBERSHIP_CARD/);
  assert.match(home, /<MembershipCard \/>/);
  assert.ok(home.indexOf("SAMSUNGDANG_FEATURE.MEMBERSHIP_CARD") < home.indexOf("<MembershipCard />"));
});

test("digital card identity comes only from verified payload and rank only from promotionHistory", async () => {
  const card = await read("../app/components/membership-card.tsx");
  assert.match(card, /verification\.verifiedPayload/);
  assert.match(card, /listPromotionHistory/);
  assert.match(card, /deriveCurrentRank\(promotions\)/);
  assert.doesNotMatch(card, /getMemberProfile|memberProfile|payload\.rank|payload\.rankDate/);
  assert.match(card, /확인된 이력 없음/);
  assert.match(card, /법적 신원증명 또는 실시간 활동회원 증명이 아닙니다/);
});

test("member PWA does not issue, reissue, share, or regenerate credential QR", async () => {
  const [page, panel, card] = await Promise.all([
    read("../app/membership/page.tsx"),
    read("../app/components/membership-registration-panel.tsx"),
    read("../app/components/membership-card.tsx")
  ]);
  const productionMembershipUi = `${page}\n${panel}\n${card}`;
  assert.doesNotMatch(productionMembershipUi, /QRCode|qr-code|재발급|credential 공유|Credential 발급/);
});

test("service worker precaches and directly falls back to the membership route", async () => {
  const serviceWorker = await read("../public/sw.js");
  assert.match(serviceWorker, /"\.\/membership\/"/);
  assert.match(serviceWorker, /endsWith\("\/membership\/"\)/);
  assert.match(serviceWorker, /caches\.match\(scoped\("\.\/membership\/"\)\)/);
});

test("Backup v1 UI states that membership is excluded from backup and preserved on restore", async () => {
  const panel = await read("../app/components/backup-restore-panel.tsx");
  assert.match(panel, /Membership Credential을 백업하지 않습니다/);
  assert.match(panel, /저장된 Membership Credential은 변경하지 않습니다/);
});

test("unlinked Fold8 diagnostic exercises production verifier with injected blocked and unknown registries only", async () => {
  const [page, diagnostic, home, productionRoute] = await Promise.all([
    read("../app/poc/membership-credential-v1/page.tsx"),
    read("../app/poc/membership-credential-v1/membership-credential-diagnostic.tsx"),
    read("../app/page.tsx"),
    read("../app/components/membership-registration-panel.tsx")
  ]);
  assert.match(page, /dev\/test only/);
  assert.match(diagnostic, /status: "blocked"/);
  assert.match(diagnostic, /UNKNOWN_KEY_ID/);
  assert.match(diagnostic, /DB를 변경하지 않습니다/);
  assert.doesNotMatch(home, /poc\/membership-credential-v1/);
  assert.doesNotMatch(productionRoute, /verify-only|status: "blocked"|PRODUCTION_TRUSTED_KEY_REGISTRY/);
});
