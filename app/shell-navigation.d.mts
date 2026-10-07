import type { SamsungdangFeature } from "./membership-gate.mjs";
export type NavigationIconName = "home" | "journal" | "kata" | "events" | "book" | "more";
export const PRIMARY_NAVIGATION: ReadonlyArray<{ href: string; label: string; icon: NavigationIconName }>;
export const MORE_NAVIGATION: ReadonlyArray<{ href: string; label: string; feature?: SamsungdangFeature }>;
export function normalizedNavigationPath(pathname: string, basePath?: string): string;
export function bindNavigationDismissal(documentTarget: Document, contains: (target: EventTarget | null) => boolean, close: () => void, focusTrigger: () => void): () => void;
