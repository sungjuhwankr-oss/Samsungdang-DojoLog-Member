import { countDistinctTrainingDays, countKataOccurrences, countTrainingSessions } from "./training-progress.mjs";

export function createTrainingSummary(sessions) {
  const names = new Map();

  for (const session of sessions) {
    for (const kata of session.kata ?? []) {
      if (typeof kata?.id === "string" && kata.id.length > 0 && !names.has(kata.id)) {
        names.set(kata.id, typeof kata.name === "string" && kata.name ? kata.name : kata.id);
      }
    }
  }

  const counts = countKataOccurrences(sessions);
  return {
    trainingDays: countDistinctTrainingDays(sessions),
    trainingSessions: countTrainingSessions(sessions),
    kata: [...counts.entries()]
      .map(([id, count]) => ({ id, name: names.get(id) ?? id, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ko"))
  };
}
