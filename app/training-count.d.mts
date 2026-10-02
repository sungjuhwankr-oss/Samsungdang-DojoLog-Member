export type TrainingCountBreakdown = Readonly<{
  total: number;
  sources: Readonly<{
    general: number;
    special: number;
    external: number;
  }>;
}>;

export function createTrainingCountBreakdown(input?: {
  trainingSessions?: unknown[];
  participatingSpecialSessions?: number;
  activeExternalSessions?: number;
}): TrainingCountBreakdown;
