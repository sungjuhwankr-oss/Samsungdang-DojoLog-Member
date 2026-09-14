import type { MemberProfile, PromotionRecord } from "./member-data.mjs";
import type { SessionKataRecord, TrainingSessionRecord } from "./training-records.mjs";

export interface MemberBackupData {
  memberProfile: MemberProfile[];
  promotionHistory: PromotionRecord[];
  trainingSession: TrainingSessionRecord[];
  sessionKata: SessionKataRecord[];
}
export interface MemberBackup {
  schema: "samsungdang-dojolog-member-backup";
  version: 1;
  exportedAt: string;
  database: { name: string; version: number };
  data: MemberBackupData;
}
export class BackupValidationError extends Error { code: string; }
export const BACKUP_SCHEMA: "samsungdang-dojolog-member-backup";
export const BACKUP_VERSION: 1;
export const MAX_BACKUP_FILE_BYTES: number;
export const MAX_RECORDS_PER_STORE: number;
export function validateBackupFileSize(size: number): void;
export function validateBackupObject(value: unknown): MemberBackup;
export function createBackup(data: MemberBackupData, exportedAt?: string): MemberBackup;
export function parseBackupText(text: string): MemberBackup;
export function replaceRepositoryFromBackup(repository: { replaceAll(data: MemberBackupData): Promise<void> }, backup: unknown): Promise<void>;
export function createMemoryBackupRepository(initial: MemberBackupData, options?: { failAfterStore?: keyof MemberBackupData }): {
  readAll(): Promise<MemberBackupData>;
  replaceAll(data: MemberBackupData): Promise<void>;
};

