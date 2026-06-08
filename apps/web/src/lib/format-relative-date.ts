import { formatAbsoluteDate } from "./format-date";

/**
 * Formats a `YYYY-MM-DD` date as a short relative label ("Today", "Yesterday",
 * "3 days ago", …), falling back to an absolute month/year for older dates.
 *
 * Both the entry date and "today" are computed in UTC, and the month-name
 * fallback is pinned to `en-US`, so the output is identical on the server and
 * the client. Without this, a non-UTC visitor would get different "today" math
 * and a localized month name during SSR, triggering a hydration mismatch
 * (React error #418). `now` is injectable so the buckets can be tested
 * deterministically.
 *
 * @returns A relative or absolute date label.
 */
export function formatRelativeDate(dateStr: string, now: Date = new Date()): string {
  // Date-only strings parse as UTC midnight, so getTime() is the UTC day start.
  const date = new Date(dateStr);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((todayUtc - date.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  if (diffDays < 14) {
    return "Last week";
  }
  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  }
  if (diffDays < 60) {
    return "Last month";
  }
  return formatAbsoluteDate(dateStr, { month: "long", year: "numeric" });
}
