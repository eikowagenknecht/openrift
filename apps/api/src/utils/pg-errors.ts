/**
 * Predicates for classifying PostgreSQL driver errors by SQLSTATE code. The
 * postgres.js driver surfaces the five-character SQLSTATE on `error.code`, so a
 * structural `code` check is all these need — no driver types are imported.
 */

/**
 * @returns `true` if the error is a Postgres unique-constraint violation
 * (SQLSTATE 23505). Used to turn a lost check-then-act race into a graceful
 * conflict response instead of an uncaught 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
