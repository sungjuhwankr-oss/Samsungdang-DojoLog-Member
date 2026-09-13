export interface SessionKata {
  id: string;
  name: string;
}

export interface SessionPayload {
  schema: "samsungdang-dojolog-session";
  version: 1;
  dojo: "samsungdang";
  sessionNo: number;
  date: string;
  kata: SessionKata[];
}

export type SessionErrorCode =
  | "no-session"
  | "fragment-too-long"
  | "invalid-base64url"
  | "decoded-too-large"
  | "invalid-utf8"
  | "invalid-json"
  | "invalid-schema"
  | "unsupported-version"
  | "invalid-dojo"
  | "invalid-session-no"
  | "invalid-date"
  | "invalid-kata-array"
  | "invalid-kata-item";

export type SessionParseResult =
  | { ok: true; payload: SessionPayload; warnings: string[] }
  | { ok: false; code: SessionErrorCode; message: string };

export const SESSION_SCHEMA: "samsungdang-dojolog-session";
export const SESSION_VERSION: 1;
export const SESSION_DOJO: "samsungdang";
export const MAX_FRAGMENT_LENGTH: number;
export const MAX_DECODED_BYTES: number;
export const MAX_KATA_COUNT: number;
export const MAX_KATA_STRING_LENGTH: number;

export function parseSessionHash(hash: string): SessionParseResult;
