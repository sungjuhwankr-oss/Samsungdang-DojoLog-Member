import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production promotion route uses one credential token and verified preview", async () => {
  const [page, panel, verifier] = await Promise.all([
    read("../app/promotion/page.tsx"),
    read("../app/components/promotion-registration-panel.tsx"),
    read("../app/credential/credential-verifier.mjs")
  ]);
  assert.match(page, /PromotionRegistrationPanel/);
  assert.match(panel, /window\.location\.search/);
  assert.match(panel, /previewPromotionCredentialToken/);
  assert.match(verifier, /getAll\("credential"\)/);
  assert.match(verifier, /tokens\.length !== 1/);
});

test("promotion UI has explicit confirm and cancel and never offers confirm to B", async () => {
  const panel = await read("../app/components/promotion-registration-panel.tsx");
  assert.match(panel, /승급이력 등록/);
  assert.match(panel, /등록 취소/);
  assert.match(panel, /assessment\.canConfirm &&/);
  assert.match(panel, /Membership Credential 등록 필요/);
  assert.match(panel, /window\.history\.replaceState/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/);
});

test("promotion confirm service re-reads history and adds in one readwrite transaction", async () => {
  const store = await read("../app/promotion-store.mjs");
  assert.match(store, /transaction\(PROMOTION_HISTORY_STORE, "readwrite"\)/);
  assert.match(store, /store\.getAll\(\)/);
  assert.match(store, /assessPromotionCredential\(verification, membershipVerification, currentHistory\)/);
  assert.match(store, /store\.add\(record\)/);
  assert.doesNotMatch(store, /\.put\(record\)/);
});

test("service worker precaches and directly falls back to the promotion route", async () => {
  const serviceWorker = await read("../public/sw.js");
  assert.match(serviceWorker, /"\.\/promotion\/"/);
  assert.match(serviceWorker, /endsWith\("\/promotion\/"\)/);
  assert.match(serviceWorker, /caches\.match\(scoped\("\.\/promotion\/"\)\)/);
  assert.match(serviceWorker, /samsungdang-member-phase4i-b-v1/);
});

test("recognized-at-entry history is labeled as entry or transfer recognition", async () => {
  const panel = await read("../app/components/member-panel.tsx");
  assert.match(panel, /recognized-at-entry/);
  assert.match(panel, /입회·이적 시 인정/);
  assert.doesNotMatch(panel, /삼성당 승급/);
});

test("Phase 4I-B does not add a DB version, store, or index", async () => {
  const [records, database] = await Promise.all([
    read("../app/training-records.mjs"),
    read("../app/training-database.mjs")
  ]);
  assert.match(records, /TRAINING_DB_VERSION = 4/);
  assert.doesNotMatch(records, /promotionReplay|credentialLedger/);
  assert.match(database, /ensureIndex\(promotions, "byOrder", "order", \{ unique: true \}\)/);
  assert.equal([...database.matchAll(/createObjectStore/g)].length, 6);
});
