export const E3_TARGET_BACKUP_SCHEMA: "samsungdang-dojolog-e3-ux-targeted-backup-v1";
export const E3_TARGET_IDENTITIES: {
  readonly eventId: string;
  readonly credentialId: string;
  readonly eventKey: string;
  readonly changeIds: readonly string[];
};

export type E3TargetedBackup = {
  schema: string;
  exportedAt: string;
  database: string;
  databaseVersion: number;
  scope: string;
  target: { eventId: string; credentialId: string; eventKey: string; changeIds: string[] };
  records: Record<string, Array<Record<string, unknown>>>;
  snapshotCounts: Record<string, number>;
};

export function prepareE3TargetedBackup(factory?: IDBFactory, options?: { now?: () => string }): Promise<E3TargetedBackup>;
export function openExistingMemberDatabaseV6(factory: IDBFactory): Promise<IDBDatabase>;
export function validateExactE3Rows(rows: E3TargetedBackup["records"]): void;
