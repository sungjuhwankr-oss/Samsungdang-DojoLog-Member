import type { HydratedTrainingSession, SessionKataRecord, SharedSessionSnapshotRecord, TrainingSessionRecord } from "./training-records.mjs";

export type KataInput = { id: string; name: string };
export type TrainingSessionInput = { date: string; note?: string; kata?: KataInput[] };
export type V2TrainingSessionRecord = Omit<TrainingSessionRecord, "source" | "note">;

export function createSharedSnapshot(session: TrainingSessionRecord | V2TrainingSessionRecord, kataRows: SessionKataRecord[]): SharedSessionSnapshotRecord;
export function migrateV2Records(sessions: V2TrainingSessionRecord[], kataRows: SessionKataRecord[]): {
  sessions: TrainingSessionRecord[];
  kataRows: SessionKataRecord[];
  snapshots: SharedSessionSnapshotRecord[];
};
export function nextPersonalSessionNo(sessions: TrainingSessionRecord[], now?: number): number;
export function createPersonalTrainingRecords(input: TrainingSessionInput, sessionNo: number, now: string): {
  session: TrainingSessionRecord;
  kata: SessionKataRecord[];
};
export function prepareTrainingSessionUpdate(existing: TrainingSessionRecord, input: TrainingSessionInput): {
  session: TrainingSessionRecord;
  kata: SessionKataRecord[];
};
export function restoreSharedSessionRecords(existing: TrainingSessionRecord, snapshot: SharedSessionSnapshotRecord): {
  session: TrainingSessionRecord;
  kata: SessionKataRecord[];
};
export function listMemoSessions(sessions: HydratedTrainingSession[], query?: string): HydratedTrainingSession[];
export function createMemoryJournalRepository(initial?: {
  trainingSession?: V2TrainingSessionRecord[];
  sessionKata?: SessionKataRecord[];
}): {
  list(): Promise<HydratedTrainingSession[]>;
  createPersonal(input: TrainingSessionInput, now?: string, clock?: number): Promise<HydratedTrainingSession>;
  update(dojo: string, sessionNo: number, input: TrainingSessionInput): Promise<HydratedTrainingSession>;
  removePersonal(dojo: string, sessionNo: number): Promise<void>;
  getSnapshot(dojo: string, sessionNo: number): Promise<SharedSessionSnapshotRecord | null>;
  restore(dojo: string, sessionNo: number): Promise<HydratedTrainingSession>;
};
