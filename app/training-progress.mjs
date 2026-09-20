import { deriveCurrentRank } from "./member-data.mjs";

export const KYU_PROGRESSION_REFERENCE = Object.freeze([
  Object.freeze({ current: null, targetType: "kyu", targetValue: 9, targetLabel: "9급", requiredTrainingSessions: 10 }),
  Object.freeze({ current: 9, targetType: "kyu", targetValue: 8, targetLabel: "8급", requiredTrainingSessions: 10 }),
  Object.freeze({ current: 8, targetType: "kyu", targetValue: 7, targetLabel: "7급", requiredTrainingSessions: 20 }),
  Object.freeze({ current: 7, targetType: "kyu", targetValue: 6, targetLabel: "6급", requiredTrainingSessions: 20 }),
  Object.freeze({ current: 6, targetType: "kyu", targetValue: 5, targetLabel: "5급", requiredTrainingSessions: 20 }),
  Object.freeze({ current: 5, targetType: "kyu", targetValue: 4, targetLabel: "4급", requiredTrainingSessions: 30 }),
  Object.freeze({ current: 4, targetType: "kyu", targetValue: 3, targetLabel: "3급", requiredTrainingSessions: 30 }),
  Object.freeze({ current: 3, targetType: "kyu", targetValue: 2, targetLabel: "2급", requiredTrainingSessions: 40 }),
  Object.freeze({ current: 2, targetType: "kyu", targetValue: 1, targetLabel: "1급", requiredTrainingSessions: 40 }),
  Object.freeze({ current: 1, targetType: "dan", targetValue: 1, targetLabel: "초단", requiredTrainingSessions: 70 })
]);

export const DAN_PROGRESSION_REFERENCE = Object.freeze([
  Object.freeze({ current: 1, target: 2, minimumYears: 1, requiredTrainingSessions: 200, minimumAge: null }),
  Object.freeze({ current: 2, target: 3, minimumYears: 2, requiredTrainingSessions: 300, minimumAge: null }),
  Object.freeze({ current: 3, target: 4, minimumYears: 3, requiredTrainingSessions: 400, minimumAge: 22 })
]);

export function getKyuProgression(currentRank) {
  if (currentRank === null) return KYU_PROGRESSION_REFERENCE[0];
  if (currentRank.rankType !== "kyu") return null;
  return KYU_PROGRESSION_REFERENCE.find((item) => item.current === currentRank.rankValue) ?? null;
}

export function countDistinctTrainingDays(sessions) {
  const dates = new Set();

  for (const session of sessions) {
    if (typeof session.date !== "string") continue;
    dates.add(session.date);
  }

  return dates.size;
}

export function countTrainingSessions(sessions, afterDate = null) {
  if (afterDate === null) return sessions.length;
  return sessions.filter((session) => (
    typeof session.date === "string" && session.date > afterDate
  )).length;
}

export function countKataOccurrences(sessions) {
  const kataBySession = new Map();

  for (const session of sessions) {
    const sessionKey = `${session.dojo}\u0000${session.sessionNo}`;
    const ids = kataBySession.get(sessionKey) ?? new Set();

    for (const kata of session.kata ?? []) {
      if (typeof kata.id === "string" && kata.id.length > 0) ids.add(kata.id);
    }

    kataBySession.set(sessionKey, ids);
  }

  const counts = new Map();
  for (const ids of kataBySession.values()) {
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function calculateTrainingProgress(actual, required) {
  if (!Number.isFinite(required) || required <= 0) {
    throw new RangeError("required training days must be greater than zero");
  }
  const remaining = Math.max(required - actual, 0);
  return {
    actual,
    required,
    remaining,
    ratio: actual / required,
    visualPercent: Math.min(Math.max((actual / required) * 100, 0), 100),
    thresholdMet: actual >= required
  };
}

function summarize(entries) {
  const practiced = entries.filter((entry) => entry.count > 0).length;
  return {
    entries,
    total: entries.length,
    practiced,
    unrecorded: entries.length - practiced
  };
}

function selectScope(entries, predicate) {
  return summarize(entries.filter(predicate));
}

function rangeLabel(targetGrade) {
  return targetGrade === 9 ? "9급" : `9급~${targetGrade}급`;
}

export function createExamKataAnalysis(catalog, sessions, currentRank) {
  const counts = countKataOccurrences(sessions);
  const allEntries = catalog.kata
    .map((kata, sourceOrder) => ({ kata, sourceOrder }))
    .filter(({ kata }) => (
      kata.exam === true &&
      Number.isInteger(kata.grade) &&
      kata.grade >= 1 &&
      kata.grade <= 9
    ))
    .sort((left, right) => (
      right.kata.grade - left.kata.grade || left.sourceOrder - right.sourceOrder
    ))
    .map(({ kata }) => ({
      id: kata.id,
      nameKo: kata.nameKo,
      grade: kata.grade,
      count: counts.get(kata.id) ?? 0
    }));

  const all = summarize(allEntries);

  if (currentRank === null) {
    const next = selectScope(allEntries, (entry) => entry.grade === 9);
    return {
      all,
      current: summarize([]),
      currentLabel: null,
      nextNew: next,
      nextNewGrade: 9,
      nextCumulative: next,
      nextCumulativeLabel: "9급"
    };
  }

  if (currentRank.rankType === "dan") {
    return {
      all,
      current: all,
      currentLabel: "9급~1급",
      nextNew: summarize([]),
      nextNewGrade: null,
      nextCumulative: summarize([]),
      nextCumulativeLabel: null
    };
  }

  if (currentRank.rankValue < 1 || currentRank.rankValue > 9) {
    return {
      all,
      current: summarize([]),
      currentLabel: null,
      nextNew: summarize([]),
      nextNewGrade: null,
      nextCumulative: summarize([]),
      nextCumulativeLabel: null
    };
  }

  const currentGrade = currentRank.rankValue;
  const nextGrade = currentGrade > 1 ? currentGrade - 1 : null;
  const current = selectScope(allEntries, (entry) => entry.grade >= currentGrade);
  const nextNew = nextGrade === null
    ? summarize([])
    : selectScope(allEntries, (entry) => entry.grade === nextGrade);
  const nextCumulative = selectScope(
    allEntries,
    (entry) => entry.grade >= (nextGrade ?? 1)
  );

  return {
    all,
    current,
    currentLabel: rangeLabel(currentGrade),
    nextNew,
    nextNewGrade: nextGrade,
    nextCumulative,
    nextCumulativeLabel: rangeLabel(nextGrade ?? 1)
  };
}

export function groupKataByGrade(scope) {
  const groups = [];

  for (let grade = 9; grade >= 1; grade -= 1) {
    const entries = scope.entries.filter((entry) => entry.grade === grade);
    if (entries.length > 0) groups.push({ grade, ...summarize(entries) });
  }

  return groups;
}

export function createTrainingAnalysis(promotions, sessions, catalog) {
  const currentRank = deriveCurrentRank(promotions);
  const progressionReference = getKyuProgression(currentRank);
  const totalTrainingDays = countDistinctTrainingDays(sessions);
  const totalTrainingSessions = countTrainingSessions(sessions);
  let progress = null;

  if (progressionReference !== null) {
    const actual = currentRank === null
      ? totalTrainingSessions
      : currentRank.date === null
        ? null
        : countTrainingSessions(sessions, currentRank.date);
    progress = {
      targetType: progressionReference.targetType,
      targetValue: progressionReference.targetValue,
      targetLabel: progressionReference.targetLabel,
      currentLabel: currentRank?.label ?? "무급",
      promotionDate: currentRank?.date ?? null,
      values: actual === null
        ? null
        : calculateTrainingProgress(actual, progressionReference.requiredTrainingSessions),
      required: progressionReference.requiredTrainingSessions
    };
  }

  return {
    currentRank,
    totalTrainingDays,
    totalTrainingSessions,
    progress,
    exam: createExamKataAnalysis(catalog, sessions, currentRank)
  };
}

export function getProgressEncouragement(progress) {
  if (progress.values === null) {
    return "현급 취득일을 입력하면 기본 수련횟수 기준의 진행상황을 계산할 수 있습니다.";
  }

  const { actual, required, remaining, thresholdMet } = progress.values;
  if (thresholdMet) {
    return `앱 기록 기준으로 ${progress.targetLabel}의 기본 수련횟수 기준을 충족했습니다.`;
  }
  if (remaining <= 3) {
    return `${progress.targetLabel} 기본 수련횟수 기준까지 ${remaining}회 남았습니다.`;
  }
  if (actual * 2 >= required) {
    return `${progress.targetLabel} 기본 수련횟수 기준의 절반 이상을 기록했습니다.`;
  }
  return `${progress.targetLabel}을 향한 앱 기록 수련을 이어가고 있습니다.`;
}

export function getNextKataEncouragement(scope) {
  if (scope.total === 0) return null;
  if (scope.unrecorded === 0) {
    return "다음 급에서 새로 추가되는 카타를 모두 한 번 이상 수련했습니다.";
  }
  return "다음 급에서 새로 추가되는 카타 중 아직 앱 기록이 없는 항목이 있습니다.";
}
