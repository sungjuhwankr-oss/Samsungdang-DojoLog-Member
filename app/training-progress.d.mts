import type { CurrentRank, PromotionRecord } from "./member-data.mjs";
import type { HydratedTrainingSession } from "./training-records.mjs";

export interface KyuProgressionReference {
  current: number | null;
  targetType: "kyu" | "dan";
  targetValue: number;
  targetLabel: string;
  requiredTrainingDays: number;
}

export interface DanProgressionReference {
  current: number;
  target: number;
  minimumYears: number;
  requiredTrainingDays: number;
  minimumAge: number | null;
}

export interface ExamCatalogEntry {
  id: string;
  nameKo: string;
  grade: number | null;
  exam: boolean;
}

export interface KataCatalog {
  kata: ExamCatalogEntry[];
}

export interface KataCountEntry {
  id: string;
  nameKo: string;
  grade: number;
  count: number;
}

export interface KataScope {
  entries: KataCountEntry[];
  total: number;
  practiced: number;
  unrecorded: number;
}

export interface TrainingProgressValues {
  actual: number;
  required: number;
  remaining: number;
  ratio: number;
  visualPercent: number;
  thresholdMet: boolean;
}

export interface TrainingProgress {
  targetType: "kyu" | "dan";
  targetValue: number;
  targetLabel: string;
  currentLabel: string;
  promotionDate: string | null;
  values: TrainingProgressValues | null;
  required: number;
}

export interface ExamKataAnalysis {
  all: KataScope;
  current: KataScope;
  currentLabel: string | null;
  nextNew: KataScope;
  nextNewGrade: number | null;
  nextCumulative: KataScope;
  nextCumulativeLabel: string | null;
}

export const KYU_PROGRESSION_REFERENCE: readonly KyuProgressionReference[];
export const DAN_PROGRESSION_REFERENCE: readonly DanProgressionReference[];
export function getKyuProgression(currentRank: CurrentRank | null): KyuProgressionReference | null;
export function countDistinctTrainingDays(sessions: HydratedTrainingSession[], startDate?: string | null): number;
export function countKataOccurrences(sessions: HydratedTrainingSession[]): Map<string, number>;
export function calculateTrainingProgress(actual: number, required: number): TrainingProgressValues;
export function createExamKataAnalysis(
  catalog: KataCatalog,
  sessions: HydratedTrainingSession[],
  currentRank: CurrentRank | null
): ExamKataAnalysis;
export function groupKataByGrade(scope: KataScope): Array<KataScope & { grade: number }>;
export function createTrainingAnalysis(
  promotions: PromotionRecord[],
  sessions: HydratedTrainingSession[],
  catalog: KataCatalog
): {
  currentRank: CurrentRank | null;
  totalTrainingDays: number;
  progress: TrainingProgress | null;
  exam: ExamKataAnalysis;
};
export function getProgressEncouragement(progress: TrainingProgress): string;
export function getNextKataEncouragement(scope: KataScope): string | null;
