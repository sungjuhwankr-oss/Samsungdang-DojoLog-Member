import { BackupValidationError, validateBackupObject } from "./backup.mjs";
import { verifyMembershipCredentialJson } from "./credential/membership-verifier.mjs";
import { validateStoredPromotionHistory } from "./promotion-records.mjs";
import { openTrainingDatabase, requestResult, transactionDone } from "./training-database.mjs";
import { createSharedSnapshot } from "./training-journal.mjs";
import {
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE,
  SAMSUNGDANG_MEMBERSHIP_STORE,
  SESSION_KATA_STORE,
  SHARED_SESSION_SNAPSHOT_STORE,
  TRAINING_SESSION_STORE
} from "./training-records.mjs";

const legacyStores = [
  TRAINING_SESSION_STORE,
  SESSION_KATA_STORE,
  MEMBER_PROFILE_STORE,
  PROMOTION_HISTORY_STORE
];

export async function readBackupV1Data(factory = indexedDB) {
  const database = await openTrainingDatabase(factory);
  try {
    const transaction = database.transaction(legacyStores, "readonly");
    const [trainingSession, sessionKata, memberProfile, promotionHistory] = await Promise.all([
      requestResult(transaction.objectStore(TRAINING_SESSION_STORE).getAll()),
      requestResult(transaction.objectStore(SESSION_KATA_STORE).getAll()),
      requestResult(transaction.objectStore(MEMBER_PROFILE_STORE).getAll()),
      requestResult(transaction.objectStore(PROMOTION_HISTORY_STORE).getAll())
    ]);
    await transactionDone(transaction);
    const sharedKeys = new Set(
      trainingSession
        .filter((session) => session.source !== "personal")
        .map((session) => `${session.dojo}\u0000${session.sessionNo}`)
    );
    return {
      memberProfile,
      promotionHistory,
      trainingSession: trainingSession.filter((session) => session.source !== "personal"),
      sessionKata: sessionKata.filter((kata) => sharedKeys.has(`${kata.dojo}\u0000${kata.sessionNo}`))
    };
  } finally {
    database.close();
  }
}

export async function restoreBackupV1ToIndexedDb(value, factory = indexedDB) {
  const backup = validateBackupObject(value);
  const database = await openTrainingDatabase(factory);
  try {
    const check = database.transaction(
      [PROMOTION_HISTORY_STORE, SAMSUNGDANG_MEMBERSHIP_STORE],
      "readonly"
    );
    const [currentPromotions, membershipRecord] = await Promise.all([
      requestResult(check.objectStore(PROMOTION_HISTORY_STORE).getAll()),
      requestResult(check.objectStore(SAMSUNGDANG_MEMBERSHIP_STORE).get("current"))
    ]);
    await transactionDone(check);
    let membershipVerification = null;
    if (membershipRecord?.envelopeJson) {
      const checked = await verifyMembershipCredentialJson(membershipRecord.envelopeJson);
      if (checked.valid && checked.credentialId === membershipRecord.credentialId && checked.keyId === membershipRecord.keyId) {
        membershipVerification = checked;
      }
    }
    try {
      await validateStoredPromotionHistory(backup.data.promotionHistory, membershipVerification);
    } catch {
      throw new BackupValidationError(
        "invalid-samsungdang-promotion",
        "삼성당 발급 승급이력의 서명 또는 저장값 교차검증에 실패했습니다."
      );
    }
    const backupCredentialIds = new Set(
      backup.data.promotionHistory
        .filter((record) => record.source === "samsungdang")
        .map((record) => record.credentialId)
    );
    const missingCurrentCredential = currentPromotions.some((record) =>
      record.source === "samsungdang" && !backupCredentialIds.has(record.credentialId)
    );
    if (missingCurrentCredential) {
      throw new BackupValidationError(
        "destructive-promotion-restore",
        "현재 저장된 삼성당 발급 승급이력이 없는 이전 백업은 복원할 수 없습니다."
      );
    }

    const transaction = database.transaction(
      [...legacyStores, SHARED_SESSION_SNAPSHOT_STORE],
      "readwrite"
    );
    const training = transaction.objectStore(TRAINING_SESSION_STORE);
    const kata = transaction.objectStore(SESSION_KATA_STORE);
    const profile = transaction.objectStore(MEMBER_PROFILE_STORE);
    const promotions = transaction.objectStore(PROMOTION_HISTORY_STORE);
    const snapshots = transaction.objectStore(SHARED_SESSION_SNAPSHOT_STORE);
    training.clear();
    kata.clear();
    profile.clear();
    promotions.clear();
    snapshots.clear();
    for (const record of backup.data.trainingSession) {
      const migrated = { ...record, source: "shared", note: "" };
      training.put(migrated);
      snapshots.put(createSharedSnapshot(migrated, backup.data.sessionKata));
    }
    for (const record of backup.data.sessionKata) kata.put(record);
    for (const record of backup.data.memberProfile) profile.put(record);
    for (const record of backup.data.promotionHistory) promotions.put(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
