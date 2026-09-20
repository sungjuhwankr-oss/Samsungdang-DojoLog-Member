import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BACKUP_SCHEMA, BACKUP_VERSION } from "../app/backup.mjs";
import {
  KATA_CATALOG_STATUS,
  validateSessionKataCatalog
} from "../app/kata-catalog-validation.mjs";
import { parseSessionHash } from "../app/session-share.mjs";
import {
  calculateTrainingProgress,
  countDistinctTrainingDays,
  countKataOccurrences,
  countTrainingSessions,
  createExamKataAnalysis,
  createTrainingAnalysis,
  getKyuProgression,
  getNextKataEncouragement,
  getProgressEncouragement,
  groupKataByGrade,
  DAN_PROGRESSION_REFERENCE,
  KYU_PROGRESSION_REFERENCE
} from "../app/training-progress.mjs";
import {
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE,
  SESSION_KATA_STORE,
  TRAINING_DB_VERSION,
  TRAINING_SESSION_STORE
} from "../app/training-records.mjs";

const catalogBytes = await readFile(
  new URL("../reference/kata-catalog.v1.json", import.meta.url)
);
const terminologyBytes = await readFile(
  new URL("../reference/terminology.v1.json", import.meta.url)
);
const catalog = JSON.parse(catalogBytes.toString("utf8"));

const known = catalog.kata.find((kata) => kata.id === "뒤양손잡기-허리던지기");

function rank(rankValue, date = "2026-02-01", order = 1, rankType = "kyu") {
  return { id: `p-${order}`, rankType, rankValue, date, order };
}

function trainingSession(sessionNo, date, kata = []) {
  return {
    dojo: "samsungdang",
    sessionNo,
    date,
    importedAt: "2026-09-15T00:00:00.000Z",
    sourceSchema: "samsungdang-dojolog-session",
    sourceVersion: 1,
    kata: kata.map((item, order) => ({ ...item, order }))
  };
}

function isoDay(offset) {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  return date.toISOString().slice(0, 10);
}

function encodedPayload(kata) {
  const payload = {
    schema: "samsungdang-dojolog-session",
    version: 1,
    dojo: "samsungdang",
    sessionNo: 1042,
    date: "2026-09-13",
    kata
  };
  return `#session=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

const progressionCases = [
  [null, "9급", 10],
  [9, "8급", 10],
  [8, "7급", 20],
  [7, "6급", 20],
  [6, "5급", 20],
  [5, "4급", 30],
  [4, "3급", 30],
  [3, "2급", 40],
  [2, "1급", 40],
  [1, "초단", 70]
];

for (const [current, targetLabel, required] of progressionCases) {
  const currentLabel = current === null ? "무급" : `${current}급`;
  test(`${currentLabel} → ${targetLabel} 기본 수련횟수는 ${required}회`, () => {
    const progression = getKyuProgression(
      current === null ? null : rank(current)
    );
    assert.equal(progression?.targetLabel, targetLabel);
    assert.equal(progression?.requiredTrainingSessions, required);
  });
}

test("같은 날짜 session 2개는 수련일수 1일, 수련횟수 2회이다", () => {
  const sessions = [
    trainingSession(1, "2026-01-01"),
    trainingSession(2, "2026-01-01")
  ];
  assert.equal(countDistinctTrainingDays(sessions), 1);
  assert.equal(countTrainingSessions(sessions), 2);
});

test("서로 다른 날짜 session 2개는 수련일수 2일, 수련횟수 2회이다", () => {
  const sessions = [
    trainingSession(1, "2026-01-01"),
    trainingSession(2, "2026-01-02")
  ];
  assert.equal(countDistinctTrainingDays(sessions), 2);
  assert.equal(countTrainingSessions(sessions), 2);
});

test("현급 취득일 당일 session은 현급 수련횟수에서 제외한다", () => {
  const sessions = [
    trainingSession(1, "2026-02-01"),
    trainingSession(2, "2026-02-02")
  ];
  assert.equal(countTrainingSessions(sessions, "2026-02-01"), 1);
});

test("현급 취득일 다음 날짜 session은 현급 수련횟수에 포함한다", () => {
  const sessions = [
    trainingSession(2, "2026-02-02")
  ];
  assert.equal(countTrainingSessions(sessions, "2026-02-01"), 1);
});

test("현급 취득일 미상이면 현급 count와 remaining을 계산하지 않는다", () => {
  const analysis = createTrainingAnalysis(
    [rank(6, null)],
    [trainingSession(1, "2026-02-02")],
    catalog
  );
  assert.equal(analysis.totalTrainingDays, 1);
  assert.equal(analysis.progress?.values, null);
});

test("현급 수련 actual과 required를 독립된 값으로 계산한다", () => {
  const sessions = [
    trainingSession(1, "2026-02-02"),
    trainingSession(2, "2026-02-02"),
    trainingSession(3, "2026-02-03")
  ];
  const progress = createTrainingAnalysis([rank(6)], sessions, catalog).progress;
  assert.equal(progress?.values?.actual, 3);
  assert.equal(progress?.values?.required, 20);
});

test("remaining은 max(required - actual, 0)이다", () => {
  assert.equal(calculateTrainingProgress(14, 20).remaining, 6);
  assert.equal(calculateTrainingProgress(23, 20).remaining, 0);
});

test("기준 초과 시에도 actual count를 자르지 않는다", () => {
  assert.equal(calculateTrainingProgress(23, 20).actual, 23);
  assert.equal(calculateTrainingProgress(23, 20).required, 20);
});

test("시각 progress만 0~100%로 clamp한다", () => {
  assert.equal(calculateTrainingProgress(23, 20).visualPercent, 100);
  assert.equal(calculateTrainingProgress(0, 20).visualPercent, 0);
});

test("기준 충족은 심사나 합격 가능 판정으로 변환되지 않는다", () => {
  const progress = {
    targetLabel: "5급",
    values: calculateTrainingProgress(23, 20)
  };
  const message = getProgressEncouragement(progress);
  assert.match(message, /기본 수련횟수 기준을 충족/);
  assert.doesNotMatch(message, /응시 자격|승급 가능|합격 가능|준비 완료/);
});

test("canonical Kata reference는 77개를 유지한다", () => {
  assert.equal(catalog.kata.length, 77);
});

test("exam-linked canonical Kata는 59개이다", () => {
  assert.equal(catalog.kata.filter((kata) => kata.exam).length, 59);
});

test("canonical Kata.id 77개가 모두 unique하다", () => {
  assert.equal(new Set(catalog.kata.map((kata) => kata.id)).size, 77);
});

test("9급~1급 전체 분석은 수련 0회인 59개 Kata도 포함한다", () => {
  const analysis = createExamKataAnalysis(catalog, [], null);
  assert.equal(analysis.all.total, 59);
  assert.equal(analysis.all.unrecorded, 59);
  assert.ok(analysis.all.entries.every((entry) => entry.count === 0));
});

test("9급~1급 grade grouping은 reference 분포를 유지한다", () => {
  const groups = groupKataByGrade(createExamKataAnalysis(catalog, [], null).all);
  assert.deepEqual(
    Object.fromEntries(groups.map((group) => [group.grade, group.total])),
    { 9: 2, 8: 4, 7: 5, 6: 8, 5: 11, 4: 8, 3: 6, 2: 8, 1: 7 }
  );
});

test("현재 6급의 누적범위는 9급~6급 exam Kata이다", () => {
  const analysis = createExamKataAnalysis(catalog, [], rank(6));
  assert.equal(analysis.currentLabel, "9급~6급");
  assert.equal(analysis.current.total, 19);
  assert.ok(analysis.current.entries.every((entry) => entry.grade >= 6));
});

test("현재 6급의 다음 급 신규 범위는 5급 Kata 11개이다", () => {
  const analysis = createExamKataAnalysis(catalog, [], rank(6));
  assert.equal(analysis.nextNewGrade, 5);
  assert.equal(analysis.nextNew.total, 11);
  assert.ok(analysis.nextNew.entries.every((entry) => entry.grade === 5));
});

test("현재 6급의 다음 심사 전체범위는 9급~5급 누적 30개이다", () => {
  const analysis = createExamKataAnalysis(catalog, [], rank(6));
  assert.equal(analysis.nextCumulativeLabel, "9급~5급");
  assert.equal(analysis.nextCumulative.total, 30);
});

test("무급의 다음 신규 및 다음 심사 범위는 모두 9급 Kata이다", () => {
  const analysis = createExamKataAnalysis(catalog, [], null);
  assert.equal(analysis.current.total, 0);
  assert.equal(analysis.nextNew.total, 2);
  assert.deepEqual(analysis.nextNew.entries, analysis.nextCumulative.entries);
});

test("다음 급 신규와 다음 심사 전체 누적범위를 혼동하지 않는다", () => {
  const analysis = createExamKataAnalysis(catalog, [], rank(6));
  assert.equal(analysis.nextNew.total, 11);
  assert.equal(analysis.nextCumulative.total, 30);
  assert.notDeepEqual(analysis.nextNew.entries, analysis.nextCumulative.entries);
});

test("카타 수련횟수는 snapshot name이 아니라 Kata.id로 집계한다", () => {
  const counts = countKataOccurrences([
    trainingSession(1, "2026-01-01", [{ id: known.id, name: known.nameKo }]),
    trainingSession(2, "2026-01-02", [{ id: known.id, name: "다른 표시 이름" }])
  ]);
  assert.equal(counts.get(known.id), 2);
});

test("name mismatch snapshot도 동일 ID canonical Kata count에 반영한다", () => {
  const analysis = createExamKataAnalysis(
    catalog,
    [trainingSession(1, "2026-01-01", [{ id: known.id, name: "불일치 이름" }])],
    rank(1)
  );
  assert.equal(analysis.all.entries.find((entry) => entry.id === known.id)?.count, 1);
});

test("unknown ID는 같은 name의 known Kata로 remap하지 않는다", () => {
  const analysis = createExamKataAnalysis(
    catalog,
    [trainingSession(1, "2026-01-01", [{ id: "future-id", name: known.nameKo }])],
    null
  );
  assert.equal(analysis.all.entries.find((entry) => entry.id === known.id)?.count, 0);
  assert.equal(analysis.all.total, 59);
});

test("같은 session에서 중복된 Kata.id는 한 번만 집계한다", () => {
  const counts = countKataOccurrences([
    trainingSession(1, "2026-01-01", [
      { id: known.id, name: known.nameKo },
      { id: known.id, name: "중복 snapshot" }
    ])
  ]);
  assert.equal(counts.get(known.id), 1);
});

test("같은 날짜의 서로 다른 session에서 같은 Kata.id는 두 번 집계한다", () => {
  const counts = countKataOccurrences([
    trainingSession(1, "2026-01-01", [{ id: known.id, name: known.nameKo }]),
    trainingSession(2, "2026-01-01", [{ id: known.id, name: known.nameKo }])
  ]);
  assert.equal(counts.get(known.id), 2);
});

test("zero-kata session은 수련일수와 수련횟수에 포함되고 Kata count에는 영향이 없다", () => {
  const sessions = [trainingSession(1, "2026-01-01")];
  const analysis = createTrainingAnalysis([], sessions, catalog);
  assert.equal(analysis.totalTrainingDays, 1);
  assert.equal(analysis.totalTrainingSessions, 1);
  assert.equal(countKataOccurrences(sessions).size, 0);
});

test("기록에 없는 canonical exam Kata는 0회 상태로 유지한다", () => {
  const analysis = createExamKataAnalysis(
    catalog,
    [trainingSession(1, "2026-01-01", [{ id: known.id, name: known.nameKo }])],
    null
  );
  assert.equal(analysis.all.total, 59);
  assert.equal(analysis.all.practiced, 1);
  assert.equal(analysis.all.unrecorded, 58);
});

test("기본 threshold 전에 실제 promotion이 있어도 오류로 판정하지 않는다", () => {
  const priorSessions = Array.from({ length: 35 }, (_, index) => (
    trainingSession(index + 1, isoDay(index))
  ));
  const currentRankSession = trainingSession(36, "2026-02-05");
  const analysis = createTrainingAnalysis(
    [rank(2, "2026-01-01", 1), rank(1, "2026-02-05", 2)],
    [...priorSessions, currentRankSession],
    catalog
  );
  assert.equal(analysis.currentRank?.rankValue, 1);
  assert.equal(analysis.progress?.values?.actual, 0);
});

test("이전 급의 부족분을 현재 급 progression에 이월하지 않는다", () => {
  const sessions = [
    trainingSession(1, "2026-01-01"),
    trainingSession(2, "2026-02-01"),
    trainingSession(3, "2026-02-02")
  ];
  const analysis = createTrainingAnalysis(
    [rank(2, "2026-01-01", 1), rank(1, "2026-02-01", 2)],
    sessions,
    catalog
  );
  assert.equal(analysis.totalTrainingDays, 3);
  assert.equal(analysis.totalTrainingSessions, 3);
  assert.equal(analysis.progress?.values?.actual, 1);
  assert.equal(analysis.progress?.values?.required, 70);
});

test("새 progression은 실제 현재 급 취득일부터 시작한다", () => {
  const sessions = [
    trainingSession(1, "2026-01-31"),
    trainingSession(2, "2026-02-01"),
    trainingSession(3, "2026-02-02")
  ];
  const analysis = createTrainingAnalysis([rank(6, "2026-02-01")], sessions, catalog);
  assert.equal(analysis.progress?.promotionDate, "2026-02-01");
  assert.equal(analysis.progress?.values?.actual, 1);
});

test("무급은 promotion date 없이 모든 session을 9급 progress에 사용한다", () => {
  const sessions = [
    trainingSession(1, "2026-01-01"),
    trainingSession(2, "2026-01-01")
  ];
  const analysis = createTrainingAnalysis([], sessions, catalog);
  assert.equal(analysis.totalTrainingDays, 1);
  assert.equal(analysis.totalTrainingSessions, 2);
  assert.equal(analysis.progress?.values?.actual, 2);
  assert.equal(analysis.progress?.values?.remaining, 8);
});

test("초기·중간·근접·기준충족 격려 문구는 deterministic하다", () => {
  const message = (actual) => getProgressEncouragement({
    targetLabel: "5급",
    values: calculateTrainingProgress(actual, 20)
  });
  assert.equal(message(2), "5급을 향한 앱 기록 수련을 이어가고 있습니다.");
  assert.equal(message(10), "5급 기본 수련횟수 기준의 절반 이상을 기록했습니다.");
  assert.equal(message(17), "5급 기본 수련횟수 기준까지 3회 남았습니다.");
  assert.equal(message(20), "앱 기록 기준으로 5급의 기본 수련횟수 기준을 충족했습니다.");
});

test("다음 급 신규 Kata에 0회 항목이 있으면 데이터 기반 문구를 만든다", () => {
  assert.equal(
    getNextKataEncouragement({ total: 2, practiced: 1, unrecorded: 1, entries: [] }),
    "다음 급에서 새로 추가되는 카타 중 아직 앱 기록이 없는 항목이 있습니다."
  );
});

test("다음 급 신규 Kata를 모두 수련하면 deterministic 문구를 만든다", () => {
  assert.equal(
    getNextKataEncouragement({ total: 2, practiced: 2, unrecorded: 0, entries: [] }),
    "다음 급에서 새로 추가되는 카타를 모두 한 번 이상 수련했습니다."
  );
});

test("격려 문구는 합격·응시 확정 또는 준비 완료를 생성하지 않는다", () => {
  const messages = KYU_PROGRESSION_REFERENCE.flatMap((reference) => [
    getProgressEncouragement({
      targetLabel: reference.targetLabel,
      values: calculateTrainingProgress(0, reference.requiredTrainingSessions)
    }),
    getProgressEncouragement({
      targetLabel: reference.targetLabel,
      values: calculateTrainingProgress(
        reference.requiredTrainingSessions,
        reference.requiredTrainingSessions
      )
    })
  ]);
  assert.doesNotMatch(messages.join(" "), /승급 가능|심사 준비 완료|응시 자격|합격 가능|자동 승급/);
});

test("IndexedDB version은 2로 유지한다", () => {
  assert.equal(TRAINING_DB_VERSION, 2);
});

test("IndexedDB store 구조는 기존 4개 이름을 유지한다", () => {
  assert.deepEqual(
    new Set([
      TRAINING_SESSION_STORE,
      SESSION_KATA_STORE,
      MEMBER_PROFILE_STORE,
      PROMOTION_HISTORY_STORE
    ]),
    new Set(["trainingSession", "sessionKata", "memberProfile", "promotionHistory"])
  );
});

test("member backup schema와 version은 v1을 유지한다", () => {
  assert.equal(BACKUP_SCHEMA, "samsungdang-dojolog-member-backup");
  assert.equal(BACKUP_VERSION, 1);
});

test("Session Share Payload schema와 version은 v1을 유지한다", () => {
  const parsed = parseSessionHash(encodedPayload([{ id: known.id, name: known.nameKo }]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.schema, "samsungdang-dojolog-session");
  assert.equal(parsed.payload.version, 1);
});

test("Phase 4B reference artifact bytes는 변경되지 않는다", () => {
  assert.equal(
    createHash("sha256").update(catalogBytes).digest("hex"),
    "a7139ee72ad12e3972d3e121e13b1a0e185ae6bc0f007d249b3f1b0af3ca8c5d"
  );
  assert.equal(
    createHash("sha256").update(terminologyBytes).digest("hex"),
    "90cddef7068f5853acb9a366af2429cfbfd3056dd8f55b3d7f05bc4e412f5f29"
  );
});

test("Phase 4C KNOWN_MATCH/UNKNOWN_ID/name mismatch 의미는 유지한다", () => {
  const snapshots = [
    { id: known.id, name: known.nameKo },
    { id: "future-id", name: "미래 카타" },
    { id: known.id, name: "다른 snapshot 이름" }
  ];
  assert.deepEqual(
    validateSessionKataCatalog(snapshots, catalog).map((item) => item.status),
    [
      KATA_CATALOG_STATUS.KNOWN_MATCH,
      KATA_CATALOG_STATUS.UNKNOWN_ID,
      KATA_CATALOG_STATUS.KNOWN_ID_NAME_MISMATCH
    ]
  );
});

test("유단자 기본 reference는 기간·횟수·연령 조건을 분리해 보존한다", () => {
  assert.deepEqual(DAN_PROGRESSION_REFERENCE, [
    { current: 1, target: 2, minimumYears: 1, requiredTrainingSessions: 200, minimumAge: null },
    { current: 2, target: 3, minimumYears: 2, requiredTrainingSessions: 300, minimumAge: null },
    { current: 3, target: 4, minimumYears: 3, requiredTrainingSessions: 400, minimumAge: 22 }
  ]);
});

test("1급 → 초단은 신규 급수 Kata 없이 9급~1급 59개를 누적범위로 유지한다", () => {
  const analysis = createExamKataAnalysis(catalog, [], rank(1));
  assert.equal(analysis.nextNew.total, 0);
  assert.equal(analysis.nextCumulativeLabel, "9급~1급");
  assert.equal(analysis.nextCumulative.total, 59);
});

test("빈 수련기록의 무급 진행도는 0 / 10이며 NaN이나 Infinity가 아니다", () => {
  const values = createTrainingAnalysis([], [], catalog).progress?.values;
  assert.equal(values?.actual, 0);
  assert.equal(values?.required, 10);
  assert.equal(values?.remaining, 10);
  assert.equal(values?.visualPercent, 0);
  assert.equal(Number.isFinite(values?.ratio), true);
});

test("잘못된 0회 threshold는 진행도 표현에 유입되지 못한다", () => {
  assert.throws(() => calculateTrainingProgress(0, 0), /greater than zero/);
});
