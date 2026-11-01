import type { E3TargetedBackup } from "./e3-targeted-backup.mjs";
export type E3DeletionResult = {
  status: "PASS";
  databaseVersion: 6;
  deletedCount: 5;
  deletedEventId: string;
  beforeCounts: Record<string, number>;
  afterCounts: Record<string, number>;
};
export function deleteExactE3RecordsWithBackup(backup: E3TargetedBackup, factory?: IDBFactory): Promise<E3DeletionResult>;
