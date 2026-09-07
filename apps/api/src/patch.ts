import { ERROR_CODES } from "@openrift/shared";

import { AppError } from "./errors.js";

/** `T` has no default: an untyped update target would make the `keyof T` column allowlist vacuous. */
export type FieldMapping<T> = Record<
  string,
  (keyof T & string) | ((value: unknown) => [keyof T & string, unknown])
>;

export function buildPatchUpdates<T>(
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
