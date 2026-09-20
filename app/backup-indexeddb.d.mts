import type { MemberBackupData } from "./backup.mjs";

export function readBackupV1Data(factory?: IDBFactory): Promise<MemberBackupData>;
export function restoreBackupV1ToIndexedDb(value: unknown, factory?: IDBFactory): Promise<void>;
