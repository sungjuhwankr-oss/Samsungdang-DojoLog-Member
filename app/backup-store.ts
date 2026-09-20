import { createBackup } from "./backup.mjs";
import type { MemberBackup, MemberBackupData } from "./backup.mjs";
import { readBackupV1Data, restoreBackupV1ToIndexedDb } from "./backup-indexeddb.mjs";

export async function readBackupDataFromIndexedDb(): Promise<MemberBackupData> {
  return readBackupV1Data();
}

export async function createIndexedDbBackup(): Promise<MemberBackup> {
  return createBackup(await readBackupDataFromIndexedDb());
}

export async function restoreIndexedDbBackup(value: unknown): Promise<void> {
  await restoreBackupV1ToIndexedDb(value);
}
