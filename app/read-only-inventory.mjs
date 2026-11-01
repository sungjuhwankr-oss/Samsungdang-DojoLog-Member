// Phase 4K-E diagnostic candidate: never create, upgrade, or mutate an IndexedDB database.
const DB_NAME = "samsungdang-dojolog-member";
const DB_VERSION = 6;
const REQUIRED_STORES = [
  "onboardingReceipt", "specialTrainingHistory", "credentialArchive", "eventParticipation"
];

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
  });
}

function specialIdentity(record) {
  let payload = {};
  try {
    payload = JSON.parse(record.envelopeJson)?.signed?.payload ?? {};
  } catch {
    // Malformed historical data is reported without exposing its signed envelope.
  }
  return {
    eventId: record.eventId,
    credentialId: record.credentialId,
    registeredAt: record.registeredAt,
    title: typeof payload.title === "string" ? payload.title : null,
    startDate: typeof payload.startDate === "string" ? payload.startDate : null,
    credentialVersion: Array.isArray(payload.sessions) ? 2 : 1,
    sessionCount: Array.isArray(payload.sessions) ? payload.sessions.length : null
  };
}

export async function inspectMemberIndexedDb(factory = indexedDB) {
  if (typeof factory?.databases !== "function") {
    throw new Error("DB 목록 조회를 지원하지 않는 브라우저입니다. 데이터는 변경하지 않았습니다.");
  }
  const databases = await factory.databases();
  const existing = databases.find(database => database.name === DB_NAME);
  if (!existing || existing.version !== DB_VERSION) {
    throw new Error("기존 회원용 DB v6을 확인하지 못했습니다. 데이터는 변경하지 않았습니다.");
  }

  const database = await new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("DB 조회 실패"));
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error("예상하지 못한 DB 변경이 감지되어 중단했습니다."));
    };
  });

  try {
    const allStores = Array.from(database.objectStoreNames);
    if (REQUIRED_STORES.some(store => !allStores.includes(store))) {
      throw new Error("필수 v6 저장소가 누락되었습니다. 데이터는 변경하지 않았습니다.");
    }

    // Queue all requests synchronously before any await; the transaction is readonly.
    const transaction = database.transaction(allStores, "readonly");
    const countsTask = Promise.all(allStores.map(async name => [
      name, await requestResult(transaction.objectStore(name).count())
    ]));
    const onboardingTask = requestResult(transaction.objectStore("onboardingReceipt").getAll());
    const specialTask = requestResult(transaction.objectStore("specialTrainingHistory").getAll());
    const archiveTask = requestResult(transaction.objectStore("credentialArchive").getAll());
    const participationTask = requestResult(transaction.objectStore("eventParticipation").getAll());
    const [counts, onboarding, special, archive, participation] = await Promise.all([
      countsTask, onboardingTask, specialTask, archiveTask, participationTask
    ]);

    return {
      schema: "samsungdang-dojolog-read-only-inventory-v1",
      database: DB_NAME,
      databaseVersion: existing.version,
      readOnly: true,
      counts: Object.fromEntries(counts),
      onboarding: onboarding.map(row => ({
        onboardingId: row.onboardingId,
        credentialId: row.credentialId,
        memberId: row.memberId,
        revision: row.revision,
        registeredAt: row.registeredAt
      })),
      specialTraining: special.map(specialIdentity),
      credentialArchive: archive.map(row => ({
        credentialId: row.credentialId,
        domain: row.domain,
        eventId: row.eventId ?? null,
        onboardingId: row.onboardingId ?? null,
        archivedAt: row.archivedAt
      })),
      eventParticipation: participation.map(row => ({
        eventId: row.eventId,
        sessionCount: Array.isArray(row.selectedSessionIds) ? row.selectedSessionIds.length : 0,
        updatedAt: row.updatedAt
      }))
    };
  } finally {
    database.close();
  }
}
