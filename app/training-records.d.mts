import type { SessionPayload } from "./session-share.mjs";

export const TRAINING_DB_NAME: "samsungdang-dojolog-member";
export const TRAINING_DB_VERSION: 6;
export const TRAINING_SESSION_STORE: "trainingSession";
export const SESSION_KATA_STORE: "sessionKata";
export const MEMBER_PROFILE_STORE: "memberProfile";
export const PROMOTION_HISTORY_STORE: "promotionHistory";
export const SHARED_SESSION_SNAPSHOT_STORE: "sharedSessionSnapshot";
export const SAMSUNGDANG_MEMBERSHIP_STORE: "samsungdangMembership";
export const SPECIAL_TRAINING_HISTORY_STORE: "specialTrainingHistory";
export const ONBOARDING_RECEIPT_STORE: "onboardingReceipt";
export const ONBOARDING_RANK_HISTORY_STORE: "onboardingRankHistory";
export const PROGRESS_BASELINE_STORE: "progressBaseline";
export const BASELINE_CHANGE_HISTORY_STORE: "baselineChangeHistory";
export const CREDENTIAL_ARCHIVE_STORE: "credentialArchive";
export const EVENT_PARTICIPATION_STORE: "eventParticipation";
export const EVENT_CHANGE_HISTORY_STORE: "eventChangeHistory";
export const EXTERNAL_EVENT_STORE: "externalEvent";
export const EVENT_MEMO_STORE: "eventMemo";
export const PERSONAL_SESSION_DOJO: "__personal__";

export type TrainingSessionSource = "shared" | "personal";

export interface TrainingSessionRecord {
  dojo: string;
  sessionNo: number;
  date: string;
  importedAt: string;
  sourceSchema: string;
  sourceVersion: number;
  source: TrainingSessionSource;
  note: string;
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

export interface SharedSessionSnapshotRecord {
  dojo: string;
  sessionNo: number;
  date: string;
  importedAt: string;
  sourceSchema: string;
  sourceVersion: number;
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
export function sessionIdentity(dojo: string, sessionNo: number): string;
export function normalizeTrainingSessionRecord(
  session: TrainingSessionRecord | Omit<TrainingSessionRecord, "source" | "note">
): TrainingSessionRecord;
