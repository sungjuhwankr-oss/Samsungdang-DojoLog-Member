function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer`);
  }
  return value;
}

/**
 * Phase 4K count adapter.
 *
 * Phase 4K-B has a physical source only for ordinary trainingSession records.
 * Phase 4K-D can supply verified participating special sessions and active
 * external sessions without changing the dashboard/stat consumers.
 */
export function createTrainingCountBreakdown({
  trainingSessions = [],
  participatingSpecialSessions = 0,
  activeExternalSessions = 0
} = {}) {
  if (!Array.isArray(trainingSessions)) {
    throw new TypeError("trainingSessions must be an array");
  }

  const general = trainingSessions.length;
  const special = nonNegativeInteger(
    participatingSpecialSessions,
    "participatingSpecialSessions"
  );
  const external = nonNegativeInteger(activeExternalSessions, "activeExternalSessions");

  return Object.freeze({
    total: general + special + external,
    sources: Object.freeze({ general, special, external })
  });
}
