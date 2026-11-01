// Phase 4K-E E9: exact-five removal is only callable after a locally verified backup.
// No bulk wipe, database removal, network request, or unrelated-store write.
import {
  E3_TARGET_BACKUP_SCHEMA,
  E3_TARGET_IDENTITIES,
  openExistingMemberDatabaseV6,
  validateExactE3Rows
} from "./e3-targeted-backup.mjs";

const TARGET = E3_TARGET_IDENTITIES;
const DELTAS = Object.freeze({
  specialTrainingHistory: 1,
  eventParticipation: 1,
  eventChangeHistory: 2,
  eventMemo: 1
});

function fail(message) {
  throw new Error(`E3-UX 정밀 삭제 중단: ${message}. 일치 여부를 다시 확인하십시오.`);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 요청 실패"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error ?? new Error("트랜잭션이 취소되었습니다."));
    transaction.onerror = () => reject(transaction.error ?? new Error("트랜잭션이 실패했습니다."));
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertBackup(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup) ||
      backup.schema !== E3_TARGET_BACKUP_SCHEMA ||
      backup.database !== "samsungdang-dojolog-member" || backup.databaseVersion !== 6 ||
      stableJson(backup.target) !== stableJson(TARGET) ||
      !backup.snapshotCounts || typeof backup.snapshotCounts !== "object" ||
      !backup.records || typeof backup.records !== "object" ||
      Object.keys(backup.records).sort().join(",") !== Object.keys(DELTAS).sort().join(",")) {
    fail("백업 문서 구조·대상 ID·DB 버전 불일치");
  }
  validateExactE3Rows(backup.records);
}

function assertCounts(baseline, current, stores) {
  if (Object.keys(baseline).sort().join(",") !== [...stores].sort().join(",")) {
    fail("백업 당시 저장소 목록과 현재 저장소 목록 불일치");
  }
  for (const store of stores) {
    if (!Number.isSafeInteger(baseline[store]) || baseline[store] < 0 ||
        baseline[store] !== current[store]) {
      fail(`${store} 기록 수가 백업 이후 변경됨`);
    }
  }
}

function readExactRecords(transaction, stores) {
  // All requests must be queued synchronously while the transaction is active.
  const countTasks = stores.map(name => requestResult(transaction.objectStore(name).count()));
  const special = requestResult(transaction.objectStore("specialTrainingHistory").get(TARGET.eventId));
  const participation = requestResult(transaction.objectStore("eventParticipation").get(TARGET.eventId));
  const history = requestResult(transaction.objectStore("eventChangeHistory").index("byEventKey").getAll(TARGET.eventKey));
  const memo = requestResult(transaction.objectStore("eventMemo").get(TARGET.eventKey));
  const archive = requestResult(transaction.objectStore("credentialArchive").get(TARGET.credentialId));
  const onboarding = requestResult(transaction.objectStore("onboardingReceipt").index("byCredentialId").get(TARGET.credentialId));
  return Promise.all([Promise.all(countTasks), special, participation, history, memo, archive, onboarding])
    .then(([counts, specialRow, participationRow, historyRows, memoRow, archiveRow, onboardingRow]) => ({
      counts: Object.fromEntries(stores.map((name, i) => [name, counts[i]])),
      rows: {
        specialTrainingHistory: specialRow === undefined ? [] : [specialRow],
        eventParticipation: participationRow === undefined ? [] : [participationRow],
        eventChangeHistory: TARGET.changeIds.map(id => historyRows.find(row => row.changeId === id)),
        eventMemo: memoRow === undefined ? [] : [memoRow]
      },
      historyRows,
      archiveRow,
      onboardingRow
    }));
}

export async function deleteExactE3RecordsWithBackup(backup, factory = indexedDB) {
  assertBackup(backup);
  const database = await openExistingMemberDatabaseV6(factory);
  try {
    const stores = Array.from(database.objectStoreNames);
    if (stores.some(store => !(store in backup.snapshotCounts)) ||
        ["specialTrainingHistory", "eventParticipation", "eventChangeHistory", "eventMemo", "credentialArchive", "onboardingReceipt"]
          .some(store => !stores.includes(store))) {
      fail("현재 DB 저장소 구조가 예상과 다름");
    }

    const transaction = database.transaction(stores, "readwrite");
    const completion = transactionDone(transaction);
    try {
      const before = await readExactRecords(transaction, stores);
      assertCounts(backup.snapshotCounts, before.counts, stores);
      if (before.historyRows.length !== 2 || before.archiveRow !== undefined || before.onboardingRow !== undefined) {
        fail("예상하지 못한 연결 기록·credential 참조");
      }
      validateExactE3Rows(before.rows);
      if (stableJson(before.rows) !== stableJson(backup.records)) {
        fail("실제 5건의 내용이 백업 원본과 다름");
      }

      const changes = [
        transaction.objectStore("specialTrainingHistory").delete(TARGET.eventId),
        transaction.objectStore("eventParticipation").delete(TARGET.eventId),
        ...TARGET.changeIds.map(id => transaction.objectStore("eventChangeHistory").delete(id)),
        transaction.objectStore("eventMemo").delete(TARGET.eventKey)
      ];
      await Promise.all(changes.map(requestResult));

      // Check the resulting snapshot before committing. A failed check aborts all five deletes.
      const after = await readExactRecords(transaction, stores);
      for (const [store, amount] of Object.entries(DELTAS)) {
        if (after.counts[store] !== before.counts[store] - amount) {
          fail(`${store} 삭제 후 기록 수 불일치`);
        }
      }
      for (const store of stores) {
        if (!(store in DELTAS) && before.counts[store] !== after.counts[store]) {
          fail(`보존 저장소 ${store} 기록 수 변경 감지`);
        }
      }
      if (Object.values(after.rows).some(rows => rows.some(row => row !== undefined)) ||
          after.historyRows.length !== 0 || after.archiveRow !== undefined || after.onboardingRow !== undefined) {
        fail("삭제 후 대상 키가 아직 남아 있음");
      }
      await completion;
      return {
        status: "PASS",
        databaseVersion: 6,
        deletedCount: 5,
        deletedEventId: TARGET.eventId,
        beforeCounts: before.counts,
        afterCounts: after.counts
      };
    } catch (error) {
      try { transaction.abort(); } catch { /* Already completed or aborted. */ }
      await completion.catch(() => {});
      throw error;
    }
  } finally {
    database.close();
  }
}
