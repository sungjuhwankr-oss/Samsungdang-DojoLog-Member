export class DuplicateJsonKeyError extends SyntaxError {
  readonly key: string;
}
export function assertNoDuplicateJsonKeys(source: string): void;
