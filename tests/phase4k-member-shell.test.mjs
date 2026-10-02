import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  createExamTable,
  getBeginnerVideoLevel,
  getCurrentKataPresentation,
  getKataExamLabels,
  groupKataByCategory
} from "../app/kata-library.mjs";
import { createTrainingCountBreakdown } from "../app/training-count.mjs";
import { BACKUP_SCHEMA, BACKUP_VERSION } from "../app/backup.mjs";
import {
  SPECIAL_TRAINING_HISTORY_STORE,
  TRAINING_DB_VERSION
} from "../app/training-records.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const catalog = JSON.parse(await read("../reference/kata-catalog.v2.json"));
const beginner = JSON.parse(await read("../reference/beginner-videos.v1.json"));

test("Phase 4K-B target routes are independent static pages", async () => {
  for (const route of [
    "journal", "kata", "beginner-videos", "membership-card",
    "promotion-history", "events", "backup"
  ]) {
    await access(new URL(`../app/${route}/page.tsx`, import.meta.url));
  }
});

test("primary mobile navigation is 홈 / 수련일지 / 카타 / 행사 / 전체", async () => {
  const navigation = await read("../app/components/app-navigation.tsx");
  for (const [href, label] of [["/", "홈"], ["/journal/", "수련일지"], ["/kata/", "카타"], ["/events/", "행사"]]) {
    assert.match(navigation, new RegExp(`href: \\\"${href.replaceAll("/", "\\/")}\\\", label: \\\"${label}\\\"`));
  }
  assert.match(navigation, /<summary[^>]*>전체<\/summary>/);
  assert.match(navigation, /usePathname/);
  assert.match(navigation, /aria-current/);
});

test("전체 menu keeps B routes visible and wraps A-only routes in credential gates", async () => {
  const navigation = await read("../app/components/app-navigation.tsx");
  assert.match(navigation, /href="\/beginner-videos\/"/);
  assert.match(navigation, /href="\/backup\/"/);
  const membership = navigation.slice(
    navigation.indexOf("SAMSUNGDANG_FEATURE.MEMBERSHIP_CARD"),
    navigation.indexOf("SAMSUNGDANG_FEATURE.TRAINING_PROGRESS")
  );
  assert.match(membership, /href="\/membership-card\/"/);
  const promotion = navigation.slice(navigation.indexOf("SAMSUNGDANG_FEATURE.TRAINING_PROGRESS"));
  assert.match(promotion, /href="\/promotion-history\/"/);
  assert.doesNotMatch(navigation, /disabled/);
  assert.doesNotMatch(navigation, /onboarding/);
});

test("A-only route contents remain fail-closed behind the existing Membership gate", async () => {
  for (const [page, feature] of [
    ["membership-card", "MEMBERSHIP_CARD"],
    ["promotion-history", "TRAINING_PROGRESS"]
  ]) {
    const source = await read(`../app/${page}/page.tsx`);
    assert.match(source, /SamsungdangFeatureBoundary/);
    assert.match(source, new RegExp(`SAMSUNGDANG_FEATURE\\.${feature}`));
    assert.match(source, /요청한 화면을 현재 사용할 수 없습니다/);
  }
});

test("dashboard separates universal cards from A-only summaries", async () => {
  const dashboard = await read("../app/components/dashboard.tsx");
  for (const href of ["/journal/", "/kata/", "/beginner-videos/", "/events/", "/backup/"]) {
    assert.match(dashboard, new RegExp(`href=\\\"${href.replaceAll("/", "\\/")}\\\"`));
  }
  assert.match(dashboard, /isMember &&/);
  assert.match(dashboard, /href="\/membership-card\/"/);
  assert.match(dashboard, /href="\/promotion-history\/"/);
  assert.match(dashboard, /전체 수련횟수/);
  assert.doesNotMatch(dashboard, /수련일수/);
});

test("training-count adapter counts every ordinary trainingSession record once", () => {
  const trainingSessions = [
    { dojo: "__personal__", sessionNo: 1, date: "2026-10-01", kata: [] },
    { dojo: "__personal__", sessionNo: 2, date: "2026-10-01", kata: [] }
  ];
  assert.deepEqual(createTrainingCountBreakdown({ trainingSessions }), {
    total: 2,
    sources: { general: 2, special: 0, external: 0 }
  });
});

test("zero-kata and same-date sessions remain separate training counts", () => {
  const breakdown = createTrainingCountBreakdown({
    trainingSessions: [
      { date: "2026-10-01", kata: [] },
      { date: "2026-10-01", kata: [{ id: "x" }] }
    ]
  });
  assert.equal(breakdown.sources.general, 2);
  assert.equal(breakdown.total, 2);
});

test("Phase 4J special history never becomes an inferred session count", () => {
  const breakdown = createTrainingCountBreakdown({
    trainingSessions: [{ dojo: "__personal__", sessionNo: 1 }],
    specialTrainingHistory: [{ eventId: "legacy-v1-without-sessions" }]
  });
  assert.deepEqual(breakdown.sources, { general: 1, special: 0, external: 0 });
  assert.equal(breakdown.total, 1);
});

test("future event sources can be composed only from explicit non-negative counts", () => {
  assert.deepEqual(createTrainingCountBreakdown({
    trainingSessions: [{}, {}],
    participatingSpecialSessions: 3,
    activeExternalSessions: 2
  }), { total: 7, sources: { general: 2, special: 3, external: 2 } });
  assert.throws(() => createTrainingCountBreakdown({ participatingSpecialSessions: -1 }), RangeError);
});

test("current Kata lookup uses stable id and never fuzzy-remaps unknown/custom records", () => {
  const known = catalog.kata.find((kata) => kata.links.length > 0);
  assert.equal(getCurrentKataPresentation(catalog, known.id).status, "video");
  assert.equal(getCurrentKataPresentation(catalog, "unknown-id-with-known-name").status, "unknown");
});

test("known no-video Kata exposes the explicit 영상 없음 state", async () => {
  const presentation = getCurrentKataPresentation(catalog, "검-아와세-1번");
  assert.equal(presentation.status, "no-video");
  assert.equal(presentation.links.length, 0);
  assert.match(await read("../app/components/training-log.tsx"), /영상 없음/);
});

test("exam labels use exact N급 and 유단자용 wording", () => {
  const kyu = catalog.kata.find((kata) => kata.examEntries.some((entry) => entry.track === "kyu"));
  const dan = catalog.kata.find((kata) => kata.examEntries.some((entry) => entry.track === "dan"));
  assert.deepEqual(getKataExamLabels(kyu), [`${kyu.examEntries[0].grade}급`]);
  assert.deepEqual(getKataExamLabels(dan), ["유단자용"]);
});

test("Kata categories cover all 97 canonical entries without reordering the catalog", () => {
  const groups = groupKataByCategory(catalog);
  assert.deepEqual(groups.map(({ id, label }) => [id, label]), [
    ["taijutsu", "기본 체술"], ["tanto", "단도"], ["ken", "검"],
    ["jo", "장"], ["multi-other", "다인·기타"]
  ]);
  assert.equal(groups.reduce((sum, group) => sum + group.kata.length, 0), 97);
  assert.deepEqual(groups.flatMap((group) => group.kata.map((kata) => kata.id)).sort(), catalog.kata.map((kata) => kata.id).sort());
});

test("full exam table contains 77 kyu and 2 dan-only Kata", () => {
  const table = createExamTable(catalog);
  assert.equal(table.kyu.reduce((sum, section) => sum + section.kata.length, 0), 77);
  assert.equal(table.dan.length, 2);
  assert.deepEqual(table.kyu.map((section) => section.grade), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

test("Kata UI provides equal library/exam tabs, full-table anchors, and current video state", async () => {
  const source = await read("../app/components/kata-library.tsx");
  assert.match(source, /카타 자료실/);
  assert.match(source, /삼성당 심사표/);
  assert.match(source, /exam-grade-/);
  assert.match(source, /응시 급까지 앞 급수의 심사항목을 누적/);
  assert.match(source, /getCurrentKataPresentation\(kataCatalog, kata\.id\)/);
  assert.doesNotMatch(source, /최초 배정 급|급부터/);
});

test("beginner library preserves all 53 exact stored title/URL pairs and source order", () => {
  assert.equal(beginner.videos.length, 53);
  assert.equal(beginner.videos[0].title, "아이키도 소개");
  assert.equal(beginner.videos.at(-1).title, "■ 맺음말");
  assert.ok(beginner.videos.every((item) => typeof item.title === "string" && typeof item.url === "string"));
  assert.equal(getBeginnerVideoLevel("■ 준비"), "section");
  assert.equal(getBeginnerVideoLevel("2-1. 맞서기 (아이한미)"), "detail");
  assert.equal(getBeginnerVideoLevel("2. 자세 (카마에)"), "item");
});

test("journal keeps note as source, offers 전체/메모/검색, and opens the original anchor", async () => {
  const source = await read("../app/components/training-log.tsx");
  for (const label of ["전체", "메모", "검색"]) assert.match(source, new RegExp(`>${label}<`));
  assert.match(source, /listMemoSessions\(records, memoQuery\)/);
  assert.match(source, /href=\{`#\$\{sessionAnchor\(record\)\}`\}/);
  assert.match(source, /setView\("all"\)/);
  assert.doesNotMatch(source, /memoStore|createObjectStore\("memo"/);
});

test("rendered Phase 4K-B UI no longer exposes 수련일수", async () => {
  const sources = await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/dashboard.tsx"),
    read("../app/components/training-summary.tsx"),
    read("../app/components/training-progress-panel.tsx"),
    read("../app/components/training-log.tsx")
  ]);
  assert.doesNotMatch(sources.join("\n"), /수련일수/);
});

test("events shell does not implement Phase 4K-D event domain semantics", async () => {
  const source = await read("../app/events/page.tsx");
  assert.match(source, /<SpecialTrainingHistory \/>/);
  assert.doesNotMatch(source, /createExternal|participantSession|special-training.*v2|eventMemo/);
});

test("Phase 4K-B preserves DB v5, seven physical stores, and Backup v1", async () => {
  assert.equal(TRAINING_DB_VERSION, 5);
  assert.equal(SPECIAL_TRAINING_HISTORY_STORE, "specialTrainingHistory");
  assert.equal(BACKUP_SCHEMA, "samsungdang-dojolog-member-backup");
  assert.equal(BACKUP_VERSION, 1);
  const database = await read("../app/training-database.mjs");
  assert.equal([...database.matchAll(/createObjectStore/g)].length, 7);
  assert.doesNotMatch(database, /version\s*=\s*6|baselineHistory|externalEvent|eventParticipation/);
});

test("service worker precaches and directly falls back to every new route", async () => {
  const serviceWorker = await read("../public/sw.js");
  for (const route of [
    "journal", "kata", "beginner-videos", "membership-card",
    "promotion-history", "events", "backup"
  ]) {
    assert.match(serviceWorker, new RegExp(`\\\"\\.\\/${route}\\/\\\"`));
    assert.match(serviceWorker, new RegExp(`endsWith\\(\\\"\\/${route}\\/\\\"\\)`));
    assert.match(serviceWorker, new RegExp(`caches\\.match\\(scoped\\(\\\"\\.\\/${route}\\/\\\"\\)\\)`));
  }
});
