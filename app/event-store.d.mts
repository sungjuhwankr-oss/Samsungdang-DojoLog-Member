import type { SpecialTrainingHistoryView } from "./special-training-records.mjs";

export const EVENTS_CHANGED_EVENT: "samsungdang-events-changed";
export class EventStoreError extends Error { readonly code: string; }

export interface EventSession { sessionId: string; date: string; label: string; }
export interface EventSessionInput { sessionId?: string; date: string; label: string; }
export interface ExternalEventInput {
  title: string;
  organizer?: string | null;
  location?: string | null;
  sessions: EventSessionInput[];
}
export interface ExternalEventRecord {
  eventId: string;
  title: string;
  organizer: string | null;
  location: string | null;
  sessions: EventSession[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  revision: number;
}
export interface EventParticipation {
  eventId: string;
  selectedSessionIds: string[];
  updatedAt: string;
  revision: number;
}
export interface EventMemo { eventKey: string; memo: string; updatedAt: string; }
export interface EventChangeHistory {
  changeId: string;
  eventKey: string;
  kind: "participation-change" | "external-create" | "external-update" | "external-delete";
  before: unknown;
  after: unknown;
  changedAt: string;
}
export type VerifiedEventView = SpecialTrainingHistoryView & {
  participation: EventParticipation | null;
  memo: EventMemo | null;
};
export type ExternalEventView = ExternalEventRecord & { memo: EventMemo | null };
export interface EventDomain {
  verified: VerifiedEventView[];
  external: ExternalEventView[];
  history: EventChangeHistory[];
}
export interface EventTrainingSession extends EventSession {
  source: "samsungdang-special" | "external";
  eventId: string;
}

export function listEventDomain(factory?: IDBFactory, verifierOptions?: object): Promise<EventDomain>;
export function createExternalEvent(input: ExternalEventInput, options?: { factory?: IDBFactory; now?: () => string; eventId?: string }): Promise<ExternalEventRecord>;
export function updateExternalEvent(eventId: string, input: ExternalEventInput, options?: { factory?: IDBFactory; now?: () => string }): Promise<ExternalEventRecord>;
export function deleteExternalEvent(eventId: string, options?: { factory?: IDBFactory; now?: () => string }): Promise<ExternalEventRecord>;
export function updateSpecialParticipation(eventId: string, selectedSessionIds: string[], options?: { factory?: IDBFactory; now?: () => string; verifierOptions?: object }): Promise<EventParticipation>;
export function saveEventMemo(eventKey: string, memo: string, options?: { factory?: IDBFactory; now?: () => string }): Promise<EventMemo>;
export function loadEventTrainingData(factory?: IDBFactory, verifierOptions?: object): Promise<{ special: EventTrainingSession[]; external: EventTrainingSession[] }>;
