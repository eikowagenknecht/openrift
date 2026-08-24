/**
 * Calendar-date validation for the `YYYY-MM-DD` strings the ingest pipelines
 * accept before they reach a `date` column.
 */

/** ISO `YYYY-MM-DD`, the shape a `date` column round-trips. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * The shape check alone would pass `2026-02-30`, which Postgres rejects at the
 * insert with a message no contributor can act on, so the parsed date has to
 * round-trip back to the same string.
 * @param value The candidate date string.
 * @returns Whether the string is a real calendar date in `YYYY-MM-DD` form.
 */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
