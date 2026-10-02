export type KataLink = Readonly<{ label?: string; url: string }>;
export type ExamEntry = Readonly<{ track: string; grade?: number }>;
export type CanonicalKata = Readonly<{
  id: string;
  nameKo: string;
  form: string;
  attack: string;
  technique: string;
  categoryId: string;
  examEntries: ExamEntry[];
  links: KataLink[];
}>;
export type KataCatalog = Readonly<{ catalogVersion: number; kata: CanonicalKata[] }>;

export const KATA_CATEGORIES: ReadonlyArray<Readonly<{ id: string; label: string }>>;
export function findCurrentKata(catalog: KataCatalog, id: string): CanonicalKata | null;
export function getCurrentKataPresentation(catalog: KataCatalog, id: string): Readonly<{
  status: "unknown" | "video" | "no-video";
  kata: CanonicalKata | null;
  links: ReadonlyArray<KataLink>;
}>;
export function getKataExamLabels(kata: CanonicalKata): string[];
export function groupKataByCategory(catalog: KataCatalog): Array<{
  id: string;
  label: string;
  kata: CanonicalKata[];
}>;
export function createExamTable(catalog: KataCatalog): {
  kyu: Array<{ grade: number; kata: CanonicalKata[] }>;
  dan: CanonicalKata[];
};
export function getBeginnerVideoLevel(title: string): "section" | "detail" | "item";
