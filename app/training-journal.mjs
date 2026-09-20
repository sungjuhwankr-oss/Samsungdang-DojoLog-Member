import {
  PERSONAL_SESSION_DOJO,
  hydrateTrainingSessions,
  normalizeTrainingSessionRecord,
  sessionIdentity
} from "./training-records.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function normalizeNote(value) {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error("note must be a string");
  if (value.length > 20_000) throw new Error("note is too long");
  return value;
}

function normalizeKata(values) {
  if (!Array.isArray(values)) throw new Error("kata must be an array");
  const unique = new Set();
  const result = [];
  for (const value of values) {
    if (!value || typeof value.id !== "string" || !value.id.trim() ||
      typeof value.name !== "string" || !value.name.trim()) {
      throw new Error("kata item is invalid");
    }
    if (unique.has(value.id)) continue;
    unique.add(value.id);
    result.push({ id: value.id, name: value.name, order: result.length });
  }
  return result;
}

export function createSharedSnapshot(session, kataRows) {
  const normalized = normalizeTrainingSessionRecord(session);
  if (normalized.source !== "shared") throw new Error("shared snapshot requires a shared session");
  return {
    dojo: normalized.dojo,
    sessionNo: normalized.sessionNo,
    date: normalized.date,
    importedAt: normalized.importedAt,
    sourceSchema: normalized.sourceSchema,
    sourceVersion: normalized.sourceVersion,
    kata: kataRows
      .filter((kata) => kata.dojo === normalized.dojo && kata.sessionNo === normalized.sessionNo)
      .sort((left, right) => left.order - right.order)
      .map((kata) => ({ id: kata.kataId, name: kata.kataName, order: kata.order }))
  };
}

export function migrateV2Records(sessions, kataRows) {
  const migratedSessions = sessions.map(normalizeTrainingSessionRecord);
  return {
    sessions: migratedSessions,
    kataRows: structuredClone(kataRows),
    snapshots: migratedSessions.map((session) => createSharedSnapshot(session, kataRows))
  };
}

export function nextPersonalSessionNo(sessions, now = Date.now()) {
  const highest = sessions
    .filter((session) => session.dojo === PERSONAL_SESSION_DOJO)
    .reduce((value, session) => Math.max(value, session.sessionNo), 0);
  return Math.max(Number.isSafeInteger(now) && now > 0 ? now : 1, highest + 1);
}

export function createPersonalTrainingRecords(input, sessionNo, now) {
  if (!validDate(input.date)) throw new Error("date must be valid YYYY-MM-DD");
  if (!Number.isSafeInteger(sessionNo) || sessionNo <= 0) throw new Error("sessionNo must be positive");
  const kata = normalizeKata(input.kata ?? []);
  return {
    session: {
      dojo: PERSONAL_SESSION_DOJO,
      sessionNo,
      date: input.date,
      importedAt: now,
      sourceSchema: "samsungdang-dojolog-personal-session",
      sourceVersion: 1,
      source: "personal",
      note: normalizeNote(input.note)
    },
    kata: kata.map((item) => ({
      dojo: PERSONAL_SESSION_DOJO,
      sessionNo,
      kataId: item.id,
      kataName: item.name,
      order: item.order
    }))
  };
}

export function prepareTrainingSessionUpdate(existing, input) {
  const session = normalizeTrainingSessionRecord(existing);
  const nextDate = input.date ?? session.date;
  if (!validDate(nextDate)) throw new Error("date must be valid YYYY-MM-DD");
  if (session.source === "shared" && nextDate !== session.date) {
    throw new Error("shared session identity is immutable");
  }
  const kata = normalizeKata(input.kata ?? []);
  return {
    session: {
      ...session,
      date: nextDate,
      note: normalizeNote(input.note)
    },
    kata: kata.map((item) => ({
      dojo: session.dojo,
      sessionNo: session.sessionNo,
      kataId: item.id,
      kataName: item.name,
      order: item.order
    }))
  };
}

export function restoreSharedSessionRecords(existing, snapshot) {
  const session = normalizeTrainingSessionRecord(existing);
  if (session.source !== "shared" || !snapshot ||
    session.dojo !== snapshot.dojo || session.sessionNo !== snapshot.sessionNo ||
    session.date !== snapshot.date) {
    throw new Error("shared snapshot identity does not match");
  }
  return prepareTrainingSessionUpdate(session, {
    date: session.date,
    note: session.note,
    kata: snapshot.kata
  });
}

export function listMemoSessions(sessions, query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  return sessions
    .filter((session) => typeof session.note === "string" && session.note.trim())
    .filter((session) => !normalizedQuery || session.note.toLocaleLowerCase("ko-KR").includes(normalizedQuery))
    .sort((left, right) => right.date.localeCompare(left.date) || right.sessionNo - left.sessionNo);
}

export function createMemoryJournalRepository(initial = {}) {
  const migrated = migrateV2Records(initial.trainingSession ?? [], initial.sessionKata ?? []);
  const sessions = new Map(migrated.sessions.map((item) => [sessionIdentity(item.dojo, item.sessionNo), item]));
  const kataRows = new Map();
  for (const item of migrated.kataRows) {
    const key = sessionIdentity(item.dojo, item.sessionNo);
    kataRows.set(key, [...(kataRows.get(key) ?? []), item]);
  }
  const snapshots = new Map(migrated.snapshots.map((item) => [sessionIdentity(item.dojo, item.sessionNo), item]));

  const list = () => hydrateTrainingSessions([...sessions.values()], [...kataRows.values()].flat());

  return {
    async list() { return structuredClone(list()); },
    async createPersonal(input, now = "2026-09-21T00:00:00.000Z", clock = Date.now()) {
      const sessionNo = nextPersonalSessionNo([...sessions.values()], clock);
      const records = createPersonalTrainingRecords(input, sessionNo, now);
      const key = sessionIdentity(records.session.dojo, records.session.sessionNo);
      sessions.set(key, records.session);
      kataRows.set(key, records.kata);
      return structuredClone({ ...records.session, kata: records.kata.map((item) => ({ id: item.kataId, name: item.kataName, order: item.order })) });
    },
    async update(dojo, sessionNo, input) {
      const key = sessionIdentity(dojo, sessionNo);
      const existing = sessions.get(key);
      if (!existing) throw new Error("session not found");
      const records = prepareTrainingSessionUpdate(existing, input);
      sessions.set(key, records.session);
      kataRows.set(key, records.kata);
      return structuredClone({ ...records.session, kata: records.kata.map((item) => ({ id: item.kataId, name: item.kataName, order: item.order })) });
    },
    async removePersonal(dojo, sessionNo) {
      const key = sessionIdentity(dojo, sessionNo);
      const existing = sessions.get(key);
      if (!existing || normalizeTrainingSessionRecord(existing).source !== "personal") {
        throw new Error("only personal sessions can be deleted");
      }
      sessions.delete(key);
      kataRows.delete(key);
    },
    async getSnapshot(dojo, sessionNo) {
      return structuredClone(snapshots.get(sessionIdentity(dojo, sessionNo)) ?? null);
    },
    async restore(dojo, sessionNo) {
      const key = sessionIdentity(dojo, sessionNo);
      const existing = sessions.get(key);
      const snapshot = snapshots.get(key);
      if (!existing || !snapshot) throw new Error("shared snapshot not found");
      const records = restoreSharedSessionRecords(existing, snapshot);
      sessions.set(key, records.session);
      kataRows.set(key, records.kata);
      return structuredClone({ ...records.session, kata: records.kata.map((item) => ({ id: item.kataId, name: item.kataName, order: item.order })) });
    }
  };
}
