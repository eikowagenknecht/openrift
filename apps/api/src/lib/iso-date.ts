/**
 * Calendar-date validation for the `YYYY-MM-DD` strings the ingest pipelines
 * accept before they reach a `date` column.
 */

/** ISO `YYYY-MM-DD`, the shape a `date` column round-trips. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** The shape check alone passes `2026-02-30`, so the parsed date must round-trip back to the same string. */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
