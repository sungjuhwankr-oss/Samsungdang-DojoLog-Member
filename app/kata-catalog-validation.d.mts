import type { SessionKata } from "./session-share.mjs";

export interface KataCatalogEntry {
  id: string;
  nameKo: string;
}

export interface KataCatalog {
  kata: KataCatalogEntry[];
}

export const KATA_CATALOG_STATUS: Readonly<{
  KNOWN_MATCH: "KNOWN_MATCH";
  UNKNOWN_ID: "UNKNOWN_ID";
  KNOWN_ID_NAME_MISMATCH: "KNOWN_ID_NAME_MISMATCH";
}>;

export type KataCatalogValidation =
  | {
      index: number;
      status: "KNOWN_MATCH" | "KNOWN_ID_NAME_MISMATCH";
      id: string;
      name: string;
      canonicalName: string;
    }
  | {
      index: number;
      status: "UNKNOWN_ID";
      id: string;
      name: string;
      canonicalName: null;
    };

export function validateSessionKataCatalog(
  kataSnapshots: SessionKata[],
  catalog: KataCatalog
): KataCatalogValidation[];
