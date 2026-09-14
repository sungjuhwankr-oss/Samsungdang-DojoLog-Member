import type { SessionPayload } from "./session-share.mjs";

export const TRAINING_DB_NAME: "samsungdang-dojolog-member";
export const TRAINING_DB_VERSION: 1;
export const TRAINING_SESSION_STORE: "trainingSession";
export const SESSION_KATA_STORE: "sessionKata";

export interface TrainingSessionRecord {
  dojo: string;
  sessionNo: number;
  date: string;
  importedAt: string;
  sourceSchema: string;
  sourceVersion: number;
}

export interface SessionKataRecord {
  dojo: string;
  sessionNo: number;
  kataId: string;
  kataName: string;
  order: number;
}

export interface HydratedTrainingSession extends TrainingSessionRecord {
  kata: Array<{ id: string; name: string; order: number }>;
}

export type SaveResult =
  | { status: "saved" }
  | { status: "duplicate" }
  | { status: "conflict" };

export interface TrainingRepository {
  save(
    payload: SessionPayload,
    importedAt: string
  ): Promise<SaveResult>;
  list(): Promise<HydratedTrainingSession[]>;
}

export function createTrainingRecords(
  payload: SessionPayload,
  importedAt: string
): { session: TrainingSessionRecord; kata: SessionKataRecord[] };

export function classifyExistingSession(
  existing: TrainingSessionRecord | undefined,
  payload: SessionPayload
): SaveResult;

export function hydrateTrainingSessions(
  sessions: TrainingSessionRecord[],
  kataRows: SessionKataRecord[]
): HydratedTrainingSession[];

export function saveTrainingSession(
  repository: TrainingRepository,
  payload: SessionPayload,
  importedAt: string
): Promise<SaveResult>;

export function createMemoryTrainingRepository(): TrainingRepository;
