import type { CanonicalKata, KataCatalog, KataLink } from "./kata-library.mjs";

export const KATA_PRESENTATION_GROUPS: ReadonlyArray<Readonly<{
  id: string;
  label: string;
  categoryIds: readonly string[];
}>>;
export function orderHombuKataPresentation(kata: readonly CanonicalKata[]): CanonicalKata[];
export function groupKataForPresentation(catalog: KataCatalog): Array<{
  id: string;
  label: string;
  kata: CanonicalKata[];
}>;
export const HOMBU_TECHNIQUE_HEADINGS: readonly string[];
export function groupKataForLibrarySections(group: {
  id: string;
  label: string;
  kata: readonly CanonicalKata[];
}): Array<{
  id: string;
  label: string;
  kata: CanonicalKata[];
}>;
export function kataVideoActions(links: readonly KataLink[]): Array<{ label: string; url: string }>;
export function kataExamBadges(kata: CanonicalKata): Array<{ label: string; anchor: string | null }>;
