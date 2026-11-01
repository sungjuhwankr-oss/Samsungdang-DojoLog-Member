export type ReadOnlyMemberInventory = {
  schema: string;
  database: string;
  databaseVersion: number;
  readOnly: true;
  counts: Record<string, number>;
  onboarding: Array<Record<string, string | number | undefined>>;
  specialTraining: Array<Record<string, string | number | null | undefined>>;
  credentialArchive: Array<Record<string, string | null | undefined>>;
  eventParticipation: Array<Record<string, string | number | undefined>>;
  eventChangeHistory: Array<Record<string, string | number | null | undefined>>;
  eventMemo: Array<Record<string, string | boolean | undefined>>;
  externalEvent: Array<Record<string, string | number | null | undefined>>;
};

export function inspectMemberIndexedDb(factory?: IDBFactory): Promise<ReadOnlyMemberInventory>;
