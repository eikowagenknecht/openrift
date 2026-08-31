import { ERROR_CODES } from "@openrift/shared";

import { AppError } from "../errors.js";

export function assertFound<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}

export function assertSlugAvailable(
  existing: unknown,
  identifier: string,
  entityName: string,
): void {
  if (existing !== null && existing !== undefined) {
    throw new AppError(409, ERROR_CODES.CONFLICT, `${entityName} "${identifier}" already exists`);
  }
}

/**
 * `keyNoun` and `unknownLabel` are kept separate because the wording diverges
 * across taxonomies: `keyNoun` fills the duplicate/count messages (e.g.
 * `"ids"`, `"slugs"`, `"language codes"`) and `unknownLabel` fills the
 * unknown-keys message (e.g. `"marker ids"`, `"finish slugs"`).
 */
export function assertValidReorder<Row>(
  keys: readonly string[],
  rows: readonly Row[],
  options: { keyOf: (row: Row) => string; keyNoun: string; unknownLabel: string },
): void {
  const { keyOf, keyNoun, unknownLabel } = options;

  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== keys.length) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Duplicate ${keyNoun} in reorder list.`);
  }

  if (keys.length !== rows.length) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Expected ${rows.length} ${keyNoun}, got ${keys.length}.`,
    );
  }

  const knownKeys = new Set(rows.map((row) => keyOf(row)));
  const unknown = keys.filter((key) => !knownKeys.has(key));
  if (unknown.length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Unknown ${unknownLabel}: ${unknown.join(", ")}`,
    );
  }
}

/**
 * Turns a repository's "did the row exist" boolean into the 404 the contract
 * declares, for write methods that report existence rather than returning the
 * row.
 */
export function assertExisted(existed: boolean, message: string): void {
  if (!existed) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}

export function assertUpdated(
  result: { numUpdatedRows: bigint } | null | undefined,
  message: string,
): void {
  if (!result || result.numUpdatedRows === 0n) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}

export function assertDeleted(
  result: { numDeletedRows: bigint } | null | undefined,
  message: string,
): void {
  if (!result || result.numDeletedRows === 0n) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}
