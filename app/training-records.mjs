export const TRAINING_DB_NAME = "samsungdang-dojolog-member";
export const TRAINING_DB_VERSION = 4;
export const TRAINING_SESSION_STORE = "trainingSession";
export const SESSION_KATA_STORE = "sessionKata";
export const MEMBER_PROFILE_STORE = "memberProfile";
export const PROMOTION_HISTORY_STORE = "promotionHistory";
export const SHARED_SESSION_SNAPSHOT_STORE = "sharedSessionSnapshot";
export const SAMSUNGDANG_MEMBERSHIP_STORE = "samsungdangMembership";
export const PERSONAL_SESSION_DOJO = "__personal__";

export function sessionIdentity(dojo, sessionNo) {
  return `${dojo}\u0000${sessionNo}`;
}

export function normalizeTrainingSessionRecord(session) {
  return {
    ...session,
    source: session.source === "personal" ? "personal" : "shared",
    note: typeof session.note === "string" ? session.note : ""
  };
}

export function createTrainingRecords(payload, importedAt) {
  return {
    session: {
      dojo: payload.dojo,
      sessionNo: payload.sessionNo,
      date: payload.date,
      importedAt,
      sourceSchema: payload.schema,
      sourceVersion: payload.version,
      source: "shared",
      note: ""
    },
    kata: payload.kata.map((item, order) => ({
      dojo: payload.dojo,
      sessionNo: payload.sessionNo,
      kataId: item.id,
      kataName: item.name,
      order
    }))
  };
}

export function classifyExistingSession(existing, payload) {
  if (!existing) return { status: "saved" };
  if (existing.date === payload.date) return { status: "duplicate" };
  return { status: "conflict" };
}

export function hydrateTrainingSessions(sessions, kataRows) {
  return sessions
    .map((storedSession) => {
      const session = normalizeTrainingSessionRecord(storedSession);
      return {
        ...session,
        kata: kataRows
          .filter((kata) => (
            kata.dojo === session.dojo &&
            kata.sessionNo === session.sessionNo
          ))
          .sort((left, right) => left.order - right.order)
          .map((kata) => ({
            id: kata.kataId,
            name: kata.kataName,
            order: kata.order
          }))
      };
    })
    .sort((left, right) => (
      right.date.localeCompare(left.date) ||
      right.sessionNo - left.sessionNo
    ));
}

export async function saveTrainingSession(repository, payload, importedAt) {
  return repository.save(payload, importedAt);
}

export function createMemoryTrainingRepository() {
  const sessions = new Map();
  const kataRows = new Map();

  const keyFor = (dojo, sessionNo) => dojo + ":" + sessionNo;

  return {
    async save(payload, importedAt) {
      const key = keyFor(payload.dojo, payload.sessionNo);
      const existing = sessions.get(key);
      const decision = classifyExistingSession(existing, payload);
      if (decision.status !== "saved") return decision;

      const records = createTrainingRecords(payload, importedAt);
      sessions.set(key, records.session);
      kataRows.set(key, records.kata);
      return { status: "saved" };
    },

    async list() {
      return hydrateTrainingSessions(
        [...sessions.values()],
        [...kataRows.values()].flat()
      );
    }
  };
}
