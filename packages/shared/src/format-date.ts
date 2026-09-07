/**
 * Date/time formatting. Never uses `Intl` or locale-dependent methods: those
 * render differently on the server than in the visitor's browser, causing a
 * React hydration mismatch (error #418).
 *
 * Calendar days ({@link formatDay}, {@link formatMonth}) are always UTC.
 * Instants render in UTC ({@link formatDayTime}) or in the viewer's own
 * timezone ({@link formatDayTimeLocal}, `ssr: "data-only"` routes only).
 */

const MONTH_ABBREVIATIONS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Returns null on bad input; formatters render `""` for it. */
function toDate(input: Date | string): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A `YYYY-MM-DD` string parses as UTC midnight, preserving the day; a full
 * instant takes its UTC calendar day.
 */
export function formatDay(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : date.toISOString().slice(0, 10);
}

export function formatMonth(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : date.toISOString().slice(0, 7);
}

/** UTC instant for admin/ops surfaces. */
export function formatDayTime(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : date.toISOString().slice(0, 16).replace("T", " ");
}

/** Viewer's local day; use {@link formatDay} when the day is a property of the data, not the viewer's own. */
export function formatDayLocal(input: Date | string): string {
  const date = toDate(input);
  if (date === null) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimeLocal(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Depends on the caller's timezone: safe only on `ssr: "data-only"` routes,
 * otherwise it causes a hydration mismatch (#418) for non-UTC visitors.
 */
export function formatDayTimeLocal(input: Date | string): string {
  const date = toDate(input);
  if (date === null) {
    return "";
  }
  return `${formatDayLocal(date)} ${formatTimeLocal(date)}`;
}

export function formatCompactUtcStamp(input: Date | string): string {
  const date = toDate(input);
  if (date === null) {
    return "";
  }
  const yyyy = date.getUTCFullYear().toString();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

export interface DateLeafParts {
  month: string;
  day: string;
  year: string;
}

export function dateLeafParts(input: Date | string): DateLeafParts {
  const date = toDate(input);
  if (date === null) {
    return { month: "", day: "", year: "" };
  }
  return {
    month: MONTH_ABBREVIATIONS[date.getMonth()],
    day: String(date.getDate()),
    year: String(date.getFullYear()),
  };
}

/**
 * UTC, unlike {@link dateLeafParts}: an event's day is fixed globally, so a
 * reader at a negative offset must not see the day before.
 */
export function dateLeafPartsUtc(input: Date | string): DateLeafParts {
  const date = toDate(input);
  if (date === null) {
    return { month: "", day: "", year: "" };
  }
  return {
    month: MONTH_ABBREVIATIONS[date.getUTCMonth()],
    day: String(date.getUTCDate()),
    year: String(date.getUTCFullYear()),
  };
}

export interface RelativeTimeOptions {
  now?: Date;
  seconds?: boolean;
  compound?: boolean;
}

function magnitude(diffMs: number, options: RelativeTimeOptions): string {
  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 1) {
    return options.seconds ? `${Math.floor(diffMs / 1000)}s` : "";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours < 24) {
    const remainder = minutes % 60;
    return options.compound && remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
  }
  const days = Math.floor(diffMs / DAY_MS);
  if (days < 7) {
    return `${days}d`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)}mo`;
  }
  return `${Math.floor(days / 365)}y`;
}

export function formatRelativeTime(
  input: Date | string,
  options: RelativeTimeOptions = {},
): string {
  const date = toDate(input);
  if (date === null) {
    return "";
  }
  const now = options.now ?? new Date();
  const diffMs = now.getTime() - date.getTime();
  const past = diffMs >= 0;
  const label = magnitude(Math.abs(diffMs), options);
  if (label === "") {
    return past ? "just now" : "in <1m";
  }
  return past ? `${label} ago` : `in ${label}`;
}

/** Both sides compared in UTC, matching {@link formatDay}, so the bucket doesn't shift with the reader's timezone. */
export function formatRelativeDay(day: string, now: Date = new Date()): string {
  const date = toDate(day);
  if (date === null) {
    return "";
  }
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((todayUtcMs - date.getTime()) / DAY_MS);

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
  return formatDay(day);
}
