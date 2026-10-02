import type { HydratedTrainingSession } from "./training-records.mjs";
import type { TrainingCountBreakdown } from "./training-count.mjs";

export interface TrainingSummaryKata {
  id: string;
  name: string;
  count: number;
}

export interface TrainingSummary {
  trainingSessions: number;
  trainingCounts: TrainingCountBreakdown;
  kata: TrainingSummaryKata[];
}

export function createTrainingSummary(sessions: HydratedTrainingSession[]): TrainingSummary;
