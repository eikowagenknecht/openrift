import { ERROR_CODES } from "@openrift/shared";

import { AppError } from "../errors.js";

/**
 * Assert that a value is not null or undefined, throwing a 404 AppError otherwise.
 * Acts as a TypeScript type guard via `asserts value is T`.
 *
 * @returns void — narrows `value` to `T` in subsequent code
 */
export function assertFound<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}

/**
 * Assert that a slug/code is free before creating a taxonomy row, throwing a
 * 409 CONFLICT otherwise. Pass the result of the repo's `getBySlug` /
 * `getByCode` lookup as `existing`; any non-nullish value is treated as a
 * collision. `entityName` is the display noun (e.g. `"Marker"`, `"Language"`)
 * and `identifier` the conflicting slug/code, producing
 * `` `${entityName} "${identifier}" already exists` ``.
 *
 * @returns void
 */
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
 * Validate a taxonomy reorder request against the current rows: the submitted
 * `keys` must contain no duplicates, must match the row count exactly, and must
 * reference only known keys. Each failure throws a 400 BAD_REQUEST.
 *
 * `keyOf` extracts the comparison key from each row (e.g. `(row) => row.id` for
 * id-keyed taxonomies, `(row) => row.slug` for slug-keyed ones). The two nouns
 * are kept separate because the wording diverges across taxonomies:
 * `keyNoun` fills the duplicate/count messages (e.g. `"ids"`, `"slugs"`,
 * `"language codes"`) and `unknownLabel` fills the unknown-keys message (e.g.
 * `"marker ids"`, `"finish slugs"`, `"language codes"`).
 *
 * @returns void
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
 * Assert that an update operation affected at least one row, throwing a 404 otherwise.
 *
 * @returns void
 */
export function assertUpdated(
  result: { numUpdatedRows: bigint } | null | undefined,
  message: string,
): void {
  if (!result || result.numUpdatedRows === 0n) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}

/**
 * Assert that a delete operation affected at least one row, throwing a 404 otherwise.
 *
 * @returns void
 */
export function assertDeleted(
  result: { numDeletedRows: bigint } | null | undefined,
  message: string,
): void {
  if (!result || result.numDeletedRows === 0n) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }
}
