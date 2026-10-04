import { encodeUnpaddedBase64Url } from "./credential/base64url.mjs";
import { listVerifiedSpecialTrainingHistory, SPECIAL_TRAINING_CHANGED_EVENT } from "./special-training-store.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import {
  EVENT_CHANGE_HISTORY_STORE,
  EVENT_MEMO_STORE,
  EVENT_PARTICIPATION_STORE,
  EXTERNAL_EVENT_STORE
} from "./training-records.mjs";

export const EVENTS_CHANGED_EVENT = "samsungdang-events-changed";

export class EventStoreError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "EventStoreError";
    this.code = code;
  }
}

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTS_CHANGED_EVENT));
    window.dispatchEvent(new Event(SPECIAL_TRAINING_CHANGED_EVENT));
  }
}

function randomId(prefix) {
  return prefix + encodeUnpaddedBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function displayText(value, field, nullable = false) {
  if (nullable && (value === null || value === undefined || String(value).trim() === "")) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 200 || !value.isWellFormed()) {
    throw new EventStoreError("invalid-field", `${field} 값이 올바르지 않습니다.`);
  }
  return value;
}

function normalizeSessions(sessions, previous = null) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new EventStoreError("session-required", "외부행사는 session을 한 개 이상 포함해야 합니다.");
  }
  const previousIds = new Set((previous ?? []).map(item => item.sessionId));
  const ids = new Set();
  return sessions.map(item => {
    const sessionId = typeof item?.sessionId === "string" && item.sessionId
      ? item.sessionId
      : randomId("xes1_");
    if (!/^xes1_[A-Za-z0-9_-]{22}$/u.test(sessionId) || ids.has(sessionId) ||
        (previous !== null && !previousIds.has(sessionId) && typeof item?.sessionId === "string" && item.sessionId)) {
      throw new EventStoreError("invalid-session-id", "외부행사 session ID가 올바르지 않습니다.");
    }
    if (!validDate(item?.date)) throw new EventStoreError("invalid-session-date", "session 날짜가 올바르지 않습니다.");
    ids.add(sessionId);
    return { sessionId, date: item.date, label: displayText(item?.label, "session label") };
  });
}

function normalizedExternalInput(input, current = null) {
  return {
    title: displayText(input?.title, "행사명"),
    organizer: displayText(input?.organizer, "주최", true),
    location: displayText(input?.location, "장소", true),
    sessions: normalizeSessions(input?.sessions, current?.sessions ?? null)
  };
}

function change(kind, eventKey, before, after, changedAt) {
  return {
    changeId: randomId("eh1_"),
    eventKey,
    kind,
    before: before === null ? null : structuredClone(before),
    after: after === null ? null : structuredClone(after),
    changedAt
  };
}

async function readStores(factory, names) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(names, "readonly");
    const result = Object.fromEntries(await Promise.all(names.map(async name => [
      name,
      await requestResult(transaction.objectStore(name).getAll())
    ])));
    await transactionDone(transaction);
    return result;
  } finally {
    database.close();
  }
}

export async function listEventDomain(factory = indexedDB, verifierOptions = {}) {
  const [verified, rows] = await Promise.all([
    listVerifiedSpecialTrainingHistory(factory, { verifierOptions }),
    readStores(factory, [EVENT_PARTICIPATION_STORE, EXTERNAL_EVENT_STORE, EVENT_MEMO_STORE, EVENT_CHANGE_HISTORY_STORE])
  ]);
  const participation = new Map(rows[EVENT_PARTICIPATION_STORE].map(item => [item.eventId, item]));
  const memos = new Map(rows[EVENT_MEMO_STORE].map(item => [item.eventKey, item]));
  return {
    verified: verified.map(event => ({
      ...event,
      participation: participation.get(event.eventId) ?? null,
      memo: memos.get(`samsungdang:${event.eventId}`) ?? null
    })),
    external: rows[EXTERNAL_EVENT_STORE]
      .map(event => ({ ...event, memo: memos.get(`external:${event.eventId}`) ?? null }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    history: rows[EVENT_CHANGE_HISTORY_STORE]
      .sort((left, right) => right.changedAt.localeCompare(left.changedAt) || right.changeId.localeCompare(left.changeId))
  };
}

export async function createExternalEvent(input, options = {}) {
  const factory = options.factory ?? indexedDB;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const normalized = normalizedExternalInput(input);
  const record = {
    eventId: options.eventId ?? randomId("xe1_"),
    ...normalized,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1
  };
  if (!/^xe1_[A-Za-z0-9_-]{22}$/u.test(record.eventId)) throw new EventStoreError("invalid-event-id");
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction([EXTERNAL_EVENT_STORE, EVENT_CHANGE_HISTORY_STORE], "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(EXTERNAL_EVENT_STORE);
    if (await requestResult(store.get(record.eventId))) {
      transaction.abort(); await done.catch(() => {}); throw new EventStoreError("event-conflict");
    }
    store.add(record);
    transaction.objectStore(EVENT_CHANGE_HISTORY_STORE).add(
      change("external-create", `external:${record.eventId}`, null, record, now)
    );
    await done;
    notifyChanged();
    return record;
  } finally {
    database.close();
  }
}

export async function updateExternalEvent(eventId, input, options = {}) {
  const factory = options.factory ?? indexedDB;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction([EXTERNAL_EVENT_STORE, EVENT_CHANGE_HISTORY_STORE], "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(EXTERNAL_EVENT_STORE);
    const current = await requestResult(store.get(eventId));
    if (!current || current.deletedAt !== null) {
      transaction.abort(); await done.catch(() => {}); throw new EventStoreError("event-not-found");
    }
    const next = { ...current, ...normalizedExternalInput(input, current), updatedAt: now, revision: current.revision + 1 };
    store.put(next);
    transaction.objectStore(EVENT_CHANGE_HISTORY_STORE).add(
      change("external-update", `external:${eventId}`, current, next, now)
    );
    await done;
    notifyChanged();
    return next;
  } finally {
    database.close();
  }
}

export async function deleteExternalEvent(eventId, options = {}) {
  const factory = options.factory ?? indexedDB;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction([EXTERNAL_EVENT_STORE, EVENT_CHANGE_HISTORY_STORE], "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(EXTERNAL_EVENT_STORE);
    const current = await requestResult(store.get(eventId));
    if (!current || current.deletedAt !== null) {
      transaction.abort(); await done.catch(() => {}); throw new EventStoreError("event-not-found");
    }
    const next = { ...current, deletedAt: now, updatedAt: now, revision: current.revision + 1 };
    store.put(next);
    transaction.objectStore(EVENT_CHANGE_HISTORY_STORE).add(
      change("external-delete", `external:${eventId}`, current, next, now)
    );
    await done;
    notifyChanged();
    return next;
  } finally {
    database.close();
  }
}

export async function updateSpecialParticipation(eventId, selectedSessionIds, options = {}) {
  const factory = options.factory ?? indexedDB;
  const now = (options.now ?? (() => new Date().toISOString()))();
  const verified = (await listVerifiedSpecialTrainingHistory(factory, { verifierOptions: options.verifierOptions ?? {} }))
    .find(item => item.eventId === eventId);
  if (!verified || verified.credentialVersion !== 2) throw new EventStoreError("verified-v2-event-required");
  const allowed = new Set(verified.sessions.map(session => session.sessionId));
  if (!Array.isArray(selectedSessionIds) || new Set(selectedSessionIds).size !== selectedSessionIds.length ||
      selectedSessionIds.some(sessionId => !allowed.has(sessionId))) {
    throw new EventStoreError("invalid-session-selection");
  }
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction([EVENT_PARTICIPATION_STORE, EVENT_CHANGE_HISTORY_STORE], "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(EVENT_PARTICIPATION_STORE);
    const before = await requestResult(store.get(eventId)) ?? null;
    const after = { eventId, selectedSessionIds: [...selectedSessionIds], updatedAt: now, revision: verified.revision };
    store.put(after);
    transaction.objectStore(EVENT_CHANGE_HISTORY_STORE).add(
      change("participation-change", `samsungdang:${eventId}`, before, after, now)
    );
    await done;
    notifyChanged();
    return after;
  } finally {
    database.close();
  }
}

export async function saveEventMemo(eventKey, memo, options = {}) {
  if (!/^(?:samsungdang:st1_|external:xe1_)[A-Za-z0-9_-]{22}$/u.test(eventKey) || typeof memo !== "string" || !memo.isWellFormed()) {
    throw new EventStoreError("invalid-memo");
  }
  const updatedAt = (options.now ?? (() => new Date().toISOString()))();
  const database = await openTrainingDatabase(options.factory ?? indexedDB);
  try {
    const transaction = database.transaction(EVENT_MEMO_STORE, "readwrite");
    transaction.objectStore(EVENT_MEMO_STORE).put({ eventKey, memo, updatedAt });
    await transactionDone(transaction);
    notifyChanged();
    return { eventKey, memo, updatedAt };
  } finally {
    database.close();
  }
}

export async function loadEventTrainingData(factory = indexedDB, verifierOptions = {}) {
  const domain = await listEventDomain(factory, verifierOptions);
  const special = domain.verified.flatMap(event => {
    if (event.credentialVersion !== 2 || !event.participation) return [];
    const selected = new Set(event.participation.selectedSessionIds);
    return event.sessions.filter(session => selected.has(session.sessionId)).map(session => ({
      source: "samsungdang-special",
      eventId: event.eventId,
      sessionId: session.sessionId,
      date: session.date,
      label: session.label
    }));
  });
  const external = domain.external.filter(event => event.deletedAt === null).flatMap(event =>
    event.sessions.map(session => ({ source: "external", eventId: event.eventId, ...session }))
  );
  return { special, external };
}
