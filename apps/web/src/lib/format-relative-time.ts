/**
 * Compact, fully-relative time label for activity feeds: "just now", "5m ago",
 * "3h ago", "2d ago", "4w ago", "5mo ago", "1y ago". Unlike
 * {@link formatRelativeDate}, it resolves sub-day granularity and never falls
 * back to an absolute date, so the output is locale- and timezone-independent
 * (which also keeps it deterministic under test).
 *
 * @param iso An ISO-8601 timestamp.
 * @param now The reference "now" (injectable for testing); defaults to the
 *   current time.
 * @returns A short relative-time label, or `""` if `iso` can't be parsed.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) {
    return "";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w ago`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)}mo ago`;
  }
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Compact countdown to a future deadline: "1d left", "23h left", "45m left",
 * and "expiring now" once under a minute (or already past). The forward-facing
 * mirror of {@link formatRelativeTime}; like it, the output is locale- and
 * timezone-independent and deterministic under test. Returns "" when `iso`
 * can't be parsed, so callers can render nothing.
 *
 * @param iso An ISO-8601 timestamp, expected to be in the future.
 * @param now The reference "now" (injectable for testing); defaults to the
 *   current time.
 * @returns A short countdown label, or `""` if `iso` can't be parsed.
 */
export function formatTimeRemaining(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  const diffMs = target.getTime() - now.getTime();
  if (Number.isNaN(diffMs)) {
    return "";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "expiring now";
  }
  if (minutes < 60) {
    return `${minutes}m left`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h left`;
  }
  return `${Math.floor(hours / 24)}d left`;
}
