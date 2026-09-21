import type { HydratedTrainingSession } from "./training-records.mjs";

export interface TrainingSummaryKata {
  id: string;
  name: string;
  count: number;
}

export interface TrainingSummary {
  trainingDays: number;
  trainingSessions: number;
  kata: TrainingSummaryKata[];
}

export function createTrainingSummary(sessions: HydratedTrainingSession[]): TrainingSummary;
