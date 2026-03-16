import { AppError } from "./errors.js";

export type FieldMapping = Record<string, string | ((value: unknown) => [string, unknown])>;

// Build a PATCH updates object from a parsed request body and a field mapping.
// Each key in fieldMap is a camelCase body field. The value is either a string
// (the snake_case column name) or a transform fn returning [column, dbValue].
// Throws 400 if no fields are present. Automatically appends updated_at.
export function buildPatchUpdates(
  body: Record<string, unknown>,
  fieldMap: FieldMapping,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const [bodyKey, mapping] of Object.entries(fieldMap)) {
    if (body[bodyKey] !== undefined) {
      if (typeof mapping === "string") {
        updates[mapping] = body[bodyKey];
      } else {
        const [column, dbValue] = mapping(body[bodyKey]);
        updates[column] = dbValue;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, "BAD_REQUEST", "No fields to update");
  }

  updates.updatedAt = new Date();
  return updates;
}
