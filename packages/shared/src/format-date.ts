/**
 * The app's date and time display vocabulary.
 *
 * Every absolute form is ISO 8601 and every one of them is built from plain
 * `Date` getters, so this module never touches `Intl`. That is deliberate:
 * `toLocaleDateString` emits different text on a UTC datacenter server than in
 * the visitor's browser, which during hydration triggers a React mismatch
 * (error #418). With no locale in play there is nothing left to disagree on,
 * so any of these can be called from a server-rendered route.
 *
 * Two timezone rules, and only two:
 *
 * - A **calendar day** ({@link formatDay}, {@link formatMonth}) is always the
 *   UTC day. A day has no timezone of its own, so picking one and stating it
 *   is the only way the same row reads the same for everyone.
 * - An **instant** renders in UTC ({@link formatDayTime}) for admin and ops
 *   surfaces, where the reader knows the server runs in UTC, or in the
 *   viewer's own timezone ({@link formatDayTimeLocal}) for anything a player
 *   reads as a wall clock. The local form is the only function here that
 *   depends on where the caller is, so it belongs on `ssr: "data-only"` routes
 *   only.
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

/**
 * Parses display input into a `Date`, or null when it can't be read. Every
 * formatter here funnels through this so bad data renders as an empty string
 * instead of throwing a `RangeError` out of a component.
 *
 * @returns The parsed date, or null when the input is unparseable.
 */
function toDate(input: Date | string): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A calendar day as `2026-08-15`, in UTC. Accepts either a `YYYY-MM-DD` string
 * (which parses as UTC midnight, so the day is preserved) or a full instant
 * (whose UTC calendar day is taken).
 *
 * @returns The UTC day, or `""` when the input is unparseable.
 */
export function formatDay(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : date.toISOString().slice(0, 10);
}

/**
 * A calendar month as `2026-08`, in UTC.
 *
 * @returns The UTC month, or `""` when the input is unparseable.
 */
export function formatMonth(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : date.toISOString().slice(0, 7);
}

/**
 * An instant as `2026-08-15 23:59`, in UTC. For admin and ops surfaces, where
 * UTC is understood. Anything a player reads as a wall clock wants
 * {@link formatDayTimeLocal} instead.
 *
 * @returns The UTC instant to minute precision, or `""` when unparseable.
 */
export function formatDayTime(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : date.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * The calendar day an instant falls on in the VIEWER's timezone, as
 * `2026-08-15`. Use this when the day is the viewer's own (grouping an activity
 * feed into "days" as they lived them); use {@link formatDay} when the day is a
 * property of the data. Same SSR caveat as {@link formatDayTimeLocal}.
 *
 * @returns The local day, or `""` when the input is unparseable.
 */
export function formatDayLocal(input: Date | string): string {
  const date = toDate(input);
  if (date === null) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The time of day of an instant in the VIEWER's timezone, as `14:30`. For rows
 * already grouped under a day, where repeating the date adds nothing. Always
 * 24-hour. Same SSR caveat as {@link formatDayTimeLocal}.
 *
 * @returns The local time to minute precision, or `""` when unparseable.
 */
export function formatTimeLocal(input: Date | string): string {
  const date = toDate(input);
  return date === null ? "" : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * An instant as `2026-08-15 14:30`, in the VIEWER's timezone. The output
 * depends on where the caller runs, so this is safe only on `ssr: "data-only"`
 * routes; on a server-rendered route it produces a hydration mismatch for
 * every visitor outside UTC.
 *
 * @returns The local instant to minute precision, or `""` when unparseable.
 */
export function formatDayTimeLocal(input: Date | string): string {
  const date = toDate(input);
  if (date === null) {
    return "";
  }
  return `${formatDayLocal(date)} ${formatTimeLocal(date)}`;
}

/**
 * The two lines of a calendar-leaf tile, in the VIEWER's timezone (the tile
 * marks "which day is this for me"). Same SSR caveat as
 * {@link formatDayTimeLocal}.
 *
 * @returns The uppercase short month and the day of month, e.g. `AUG` / `15`.
 */
export function dateLeafParts(input: Date | string): { month: string; day: string } {
  const date = toDate(input);
  if (date === null) {
    return { month: "", day: "" };
  }
  return { month: MONTH_ABBREVIATIONS[date.getMonth()], day: String(date.getDate()) };
}

/** Tuning for {@link formatRelativeTime}. */
export interface RelativeTimeOptions {
  /** The reference "now"; injectable so tests can pin the buckets. */
  now?: Date;
  /** Resolve below a minute as seconds (`45s ago`) instead of collapsing it. */
  seconds?: boolean;
  /** Carry the minutes alongside the hours (`in 2h 15m`). */
  compound?: boolean;
}

/**
 * The size of a gap, without direction: `45s`, `5m`, `2h 15m`, `3d`, `4w`,
 * `5mo`, `1y`. Buckets coarsen as the gap grows, since nobody reads "in 4380h".
 *
 * @returns The magnitude label, or `""` when it falls below the resolution the
 *   options allow (the caller phrases that case itself).
 */
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

/**
 * How far an instant is from now, in either direction: `just now`, `5m ago`,
 * `3h ago`, `2d ago`, `4w ago`, `1y ago` for the past, and `in 5m`, `in 3h`,
 * `in <1m` for the future. Locale- and timezone-independent (it is arithmetic
 * on two instants, not a rendering of either), so it is deterministic under
 * test and safe anywhere.
 *
 * @param input An instant, as a `Date` or an ISO-8601 string.
 * @param options Reference time and resolution; see {@link RelativeTimeOptions}.
 * @returns The relative label, or `""` when the input is unparseable.
 */
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

/**
 * A calendar day relative to today: `Today`, `Yesterday`, `3 days ago`,
 * `Last week`, `2 weeks ago`, `Last month`, falling back to the plain day for
 * anything older. Both sides of the comparison are UTC days, matching
 * {@link formatDay}, so the bucket never shifts with the reader's timezone.
 *
 * @param day A `YYYY-MM-DD` calendar day.
 * @param now The reference "now"; injectable for tests.
 * @returns The relative label, or the ISO day once the gap outgrows the buckets.
 */
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
