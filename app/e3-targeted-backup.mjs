// Phase 4K-E E9: one-time, exact-identity E3-UX preservation export.
// This module has no write transaction, delete operation, restore operation, or network request.
const DATABASE_NAME = "samsungdang-dojolog-member";
const DATABASE_VERSION = 6;
export const E3_TARGET_IDENTITIES = Object.freeze({
  eventId: "st1_F0YmWz2aUlSE-ssm9nhDZQ",
  credentialId: "c1_GBR0WQn7hVFqM22mr3tuTQ",
  eventKey: "samsungdang:st1_F0YmWz2aUlSE-ssm9nhDZQ",
  changeIds: Object.freeze([
    "eh1_2ae6f0ce-d326-438a-8a11-362a81b610a6",
    "eh1_dlBtfg3xrrmMTbSck7Fk2g"
  ])
});
const TARGET = E3_TARGET_IDENTITIES;

const TARGET_STORES = [
  "specialTrainingHistory", "eventParticipation", "eventChangeHistory", "eventMemo"
];
const REQUIRED_STORES = [...TARGET_STORES, "credentialArchive", "onboardingReceipt"];
const EXPECTED = Object.freeze({
  registeredAt: "2026-11-01T05:23:44.127Z",
  participationUpdatedAt: "2026-11-01T05:24:45.182Z",
  memoUpdatedAt: "2026-11-01T05:33:03.853Z",
  title: "E3-UX 테스트 전용 특별수련(실제 수련 아님)",
  startDate: "2026-11-01"
});

export const E3_TARGET_BACKUP_SCHEMA = "samsungdang-dojolog-e3-ux-targeted-backup-v1";

function fail(reason) {
  throw new Error(`E3-UX 정확한 백업 조건 불일치: ${reason}. 데이터는 변경하지 않았습니다.`);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 읽기 실패"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error ?? new Error("읽기 트랜잭션 중단"));
    transaction.onerror = () => reject(transaction.error ?? new Error("읽기 트랜잭션 실패"));
  });
}

export async function openExistingMemberDatabaseV6(factory) {
  if (typeof factory?.databases !== "function") {
    fail("브라우저가 DB 목록 조회를 지원하지 않음");
  }
  const available = await factory.databases();
  if (!available.some(row => row.name === DATABASE_NAME && row.version === DATABASE_VERSION)) {
    fail("기존 회원용 DB v6 확인 실패");
  }
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("기존 DB 열기 실패"));
    request.onblocked = () => reject(new Error("DB 연결이 다른 창에서 차단되었습니다."));
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error("DB 변경이 감지되어 중단했습니다. 데이터는 변경하지 않았습니다."));
    };
  });
}

function requirePlainJson(value, field, visited = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return;
  if (typeof value !== "object" || visited.has(value)) fail(`${field} JSON 손실 가능성`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    fail(`${field} JSON 호환 형식 아님`);
  }
  visited.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail(`${field} JSON 배열 형식 불일치`);
    for (const item of value) requirePlainJson(item, field, visited);
  } else {
    for (const [key, child] of Object.entries(value)) requirePlainJson(child, `${field}.${key}`, visited);
  }
  visited.delete(value);
}

export function validateExactE3Rows(rows) {
  const special = rows.specialTrainingHistory[0];
  const participation = rows.eventParticipation[0];
  const memo = rows.eventMemo[0];
  const [first, second] = rows.eventChangeHistory;
  if (!special || special.eventId !== TARGET.eventId || special.credentialId !== TARGET.credentialId ||
      special.registeredAt !== EXPECTED.registeredAt || typeof special.envelopeJson !== "string") {
    fail("특별수련 기록·credential ID·등록시각");
  }

  let payload;
  try {
    payload = JSON.parse(special.envelopeJson)?.signed?.payload;
  } catch {
    fail("서명된 특별수련 원문의 JSON 형식");
  }
  if (payload?.eventId !== TARGET.eventId || payload?.title !== EXPECTED.title ||
      payload?.startDate !== EXPECTED.startDate || !Array.isArray(payload.sessions) ||
      payload.sessions.length !== 2) {
    fail("특별수련 v2 내용·2회차 정의");
  }

  if (!participation || participation.eventId !== TARGET.eventId ||
      participation.updatedAt !== EXPECTED.participationUpdatedAt ||
      !Array.isArray(participation.selectedSessionIds) || participation.selectedSessionIds.length !== 2 ||
      new Set(participation.selectedSessionIds).size !== 2 ||
      !participation.selectedSessionIds.every(id => payload.sessions.some(session => session.sessionId === id))) {
    fail("2회차 참가 기록");
  }

  if (!first || !second || first.changeId !== TARGET.changeIds[0] || second.changeId !== TARGET.changeIds[1] ||
      [first, second].some(row => row.eventKey !== TARGET.eventKey || row.kind !== "participation-change") ||
      first.changedAt !== EXPECTED.registeredAt || second.changedAt !== EXPECTED.participationUpdatedAt ||
      first.before !== null || first.after?.selectedSessionIds?.length !== 1 ||
      second.before?.selectedSessionIds?.length !== 1 || second.after?.selectedSessionIds?.length !== 2) {
    fail("변경 이력 2건");
  }

  if (!memo || memo.eventKey !== TARGET.eventKey || memo.updatedAt !== EXPECTED.memoUpdatedAt ||
      typeof memo.memo !== "string" || memo.memo.length === 0) {
    fail("메모 본문·수정시각");
  }
  for (const [store, records] of Object.entries(rows)) {
    for (const record of records) requirePlainJson(record, store);
  }
}

export async function prepareE3TargetedBackup(factory = indexedDB, options = {}) {
  const database = await openExistingMemberDatabaseV6(factory);
  try {
    const stores = Array.from(database.objectStoreNames);
    if (REQUIRED_STORES.some(store => !stores.includes(store))) {
      fail("필수 저장소가 누락됨");
    }

    // Every request is queued synchronously in one readonly snapshot transaction.
    const transaction = database.transaction(stores, "readonly");
    const done = transactionDone(transaction);
    const countRequests = stores.map(store => requestResult(transaction.objectStore(store).count()));
    const specialTask = requestResult(transaction.objectStore("specialTrainingHistory").get(TARGET.eventId));
    const participationTask = requestResult(transaction.objectStore("eventParticipation").get(TARGET.eventId));
    const memoTask = requestResult(transaction.objectStore("eventMemo").get(TARGET.eventKey));
    const historyTask = requestResult(transaction.objectStore("eventChangeHistory").index("byEventKey").getAll(TARGET.eventKey));
    const archiveTask = requestResult(transaction.objectStore("credentialArchive").get(TARGET.credentialId));
    const onboardingTask = requestResult(transaction.objectStore("onboardingReceipt").index("byCredentialId").get(TARGET.credentialId));

    const [counts, special, participation, memo, history, archive, onboarding] = await Promise.all([
      Promise.all(countRequests), specialTask, participationTask, memoTask,
      historyTask, archiveTask, onboardingTask
    ]);
    await done;
    if (archive !== undefined || onboarding !== undefined) fail("예상하지 못한 credential 교차 참조");
    if (history.length !== 2 ||
        new Set(history.map(row => row.changeId)).size !== 2 ||
        TARGET.changeIds.some(id => !history.some(row => row.changeId === id))) {
      fail("같은 행사 키에 예상 외 변경 이력이 존재함");
    }
    const indexed = new Map(history.map(row => [row.changeId, row]));
    const rows = {
      specialTrainingHistory: special === undefined ? [] : [special],
      eventParticipation: participation === undefined ? [] : [participation],
      eventChangeHistory: TARGET.changeIds.map(id => indexed.get(id)),
      eventMemo: memo === undefined ? [] : [memo]
    };
    validateExactE3Rows(rows);

    const document = {
      schema: E3_TARGET_BACKUP_SCHEMA,
      exportedAt: (options.now ?? (() => new Date().toISOString()))(),
      database: DATABASE_NAME,
      databaseVersion: DATABASE_VERSION,
      scope: "Fold8-A E3-UX exact five records only; no deletion",
      target: TARGET,
      records: rows,
      snapshotCounts: Object.fromEntries(stores.map((store, i) => [store, counts[i]]))
    };
    requirePlainJson(document, "백업 문서");
    return document;
  } finally {
    database.close();
  }
}
