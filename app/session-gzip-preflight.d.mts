export class GzipFrameError extends Error {
  code: "invalid-compressed-stream" | "inflated-too-large";
  constructor(code: "invalid-compressed-stream" | "inflated-too-large");
}
export function crc32(bytes: Uint8Array): number;
export function preflightGzip(bytes: Uint8Array, limit: number): {
  inflatedBytes: number;
  checksum: number;
};
export function inflateGzipBounded(bytes: Uint8Array, limit: number): Uint8Array;
