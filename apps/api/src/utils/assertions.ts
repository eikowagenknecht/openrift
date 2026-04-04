import { AppError, ERROR_CODES } from "../errors.js";

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
