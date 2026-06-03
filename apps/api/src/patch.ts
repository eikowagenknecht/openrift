import { ERROR_CODES } from "@openrift/shared";

import { AppError } from "./errors.js";

/**
 * Maps request-body fields to columns of the update target `T`. Each value is
 * either a column name (`keyof T`) or a transform returning `[column, dbValue]`.
 * Constraining values to `keyof T` makes the writable-column set a compile-time
 * allowlist: a typo'd or non-existent column fails to compile. `T` defaults to
 * `Record<string, unknown>` for callers that have not yet adopted a typed
 * update target.
 */
export type FieldMapping<T = Record<string, unknown>> = Record<
  string,
  (keyof T & string) | ((value: unknown) => [keyof T & string, unknown])
>;

/**
 * Build a PATCH updates object from a parsed request body and a field mapping.
 * Each key in fieldMap is a body field; the value is either the target column
 * name or a transform fn returning `[column, dbValue]`. Only present body
 * fields are included.
 * @throws {AppError} 400 if no fields are present.
 * @returns A partial of `T` containing only the mapped, present columns.
 */
export function buildPatchUpdates<T = Record<string, unknown>>(
  body: Record<string, unknown>,
  fieldMap: FieldMapping<T>,
): Partial<T> {
  const updates: Partial<T> = {};
  const writable = updates as Record<string, unknown>;

  for (const [bodyKey, mapping] of Object.entries(fieldMap)) {
    if (body[bodyKey] !== undefined) {
      if (typeof mapping === "string") {
        writable[mapping] = body[bodyKey];
      } else {
        const [column, dbValue] = mapping(body[bodyKey]);
        writable[column] = dbValue;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No fields to update");
  }

  return updates;
}
