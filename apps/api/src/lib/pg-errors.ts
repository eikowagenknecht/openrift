/**
 * postgres.js surfaces the five-character SQLSTATE on `error.code`, so a
 * structural check is all these need; no driver types are imported.
 */

/** True if the error is a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * True if the violation is on the named constraint specifically. Use over
 * {@link isUniqueViolation} when a block can raise 23505 from more than one index.
 */
export function isUniqueViolationOn(error: unknown, constraintName: string): boolean {
  return (
    isUniqueViolation(error) &&
    (error as { constraint_name?: unknown }).constraint_name === constraintName
  );
}

/**
 * Reads the message off a `RAISE EXCEPTION` thrown by a plpgsql trigger or
 * function (SQLSTATE P0001). Returns `null` when the error is not a P0001.
 */
export function raisedExceptionMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== "P0001" || typeof message !== "string" || message === "") {
    return null;
  }
  return message;
}
