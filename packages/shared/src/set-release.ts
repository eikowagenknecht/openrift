/**
 * Per-language set release dates (migration 233).
 *
 * A set reaches each language on its own date, so "when did this come out"
 * is only answerable for a (set, language) pair. Whether a set is *released*
 * is derived here rather than stored, so a date and a flag can never disagree.
 */

/** How wide a period a {@link SetRelease.releasedAt} date stands for. */
export type ReleasePrecision = "day" | "month" | "quarter" | "year";

/**
 * When a set reached one language. `releasedAt` is the FIRST day of the known
 * period, `precision` says how wide that period is. Both null means announced
 * with no date yet.
 */
export interface SetRelease {
  releasedAt: string | null;
  precision: ReleasePrecision | null;
}

/** A set's releases keyed by language code. A missing key means not announced. */
export type SetReleases = Record<string, SetRelease>;

/**
 * Today's date in UTC as `YYYY-MM-DD`. UTC on purpose: derived release state
 * is computed during SSR and again at hydration, and a server in UTC compared
 * against a browser in the visitor's timezone would disagree for anyone west
 * of Greenwich after 00:00 local, producing a React #418 hydration mismatch.
 *
 * @returns The current UTC calendar day.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The last day of the period a release date stands for: the date itself at day
 * precision, the end of the month / quarter / year otherwise.
 *
 * @returns The period's final day as `YYYY-MM-DD`, or null when undated.
 */
export function releasePeriodEnd(release: SetRelease): string | null {
  const { releasedAt, precision } = release;
  if (!releasedAt || !precision) {
    return null;
  }
  const year = Number(releasedAt.slice(0, 4));
  const month = Number(releasedAt.slice(5, 7));
  if (precision === "day") {
    return releasedAt;
  }
  // Day 0 of the following month is the last day of the month before it, so
  // this lands on the period's final day without any leap-year special case.
  const endMonth = precision === "year" ? 12 : precision === "quarter" ? month + 2 : month;
  return new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10);
}

/**
 * Snaps a date to the first day of the period its precision describes, which
 * is the form both the `set_releases` CHECK and the admin contract require.
 * Lets an editor pick any day in a quarter and mean the quarter.
 *
 * @returns The release with `releasedAt` moved to its period's first day.
 */
export function normalizeToPeriodStart(release: SetRelease): SetRelease {
  const { releasedAt, precision } = release;
  if (!releasedAt || !precision || precision === "day") {
    return release;
  }
  const year = releasedAt.slice(0, 4);
  if (precision === "year") {
    return { releasedAt: `${year}-01-01`, precision };
  }
  const month = Number(releasedAt.slice(5, 7));
  const startMonth = precision === "quarter" ? Math.floor((month - 1) / 3) * 3 + 1 : month;
  return { releasedAt: `${year}-${String(startMonth).padStart(2, "0")}-01`, precision };
}

/**
 * Whether a set is out in the language this release describes. An undated
 * release is never out: anything actually on shelves can be dated to at least
 * its year, so a missing date can only mean "not yet".
 *
 * Compares against the END of the period, so a set dated only to "Q4 2026"
 * stays unreleased until that quarter is over. Being late to drop the preview
 * marker is the safe direction — the Riot community license wants unreleased
 * cards labelled.
 *
 * @returns True when the release period has finished.
 */
export function isReleased(release: SetRelease | undefined, today = todayUtc()): boolean {
  if (!release) {
    return false;
  }
  const end = releasePeriodEnd(release);
  return end !== null && end <= today;
}

/**
 * Whether a set is out in one specific language.
 *
 * @returns True when that language has a release period that has finished.
 */
export function isReleasedIn(releases: SetReleases, language: string, today = todayUtc()): boolean {
  return isReleased(releases[language], today);
}

/**
 * The earliest release across every language a set is announced in, for
 * set-level display and ordering. Undated languages never win.
 *
 * @returns The earliest dated release, or undefined when the set has none.
 */
export function earliestRelease(releases: SetReleases): SetRelease | undefined {
  let earliest: SetRelease | undefined;
  for (const release of Object.values(releases)) {
    if (release.releasedAt && (!earliest?.releasedAt || release.releasedAt < earliest.releasedAt)) {
      earliest = release;
    }
  }
  return earliest;
}

/**
 * Whether a set is out in at least one language.
 * @returns True if any language's release period has finished.
 */
export function isReleasedAnywhere(releases: SetReleases, today = todayUtc()): boolean {
  return Object.values(releases).some((release) => isReleased(release, today));
}

const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"] as const;

/**
 * A release period as display text: `31 October 2025`, `March 2026`,
 * `Q2 2026`, `2026`, or `TBA` when undated.
 *
 * Locale and timezone are pinned (as in the web app's `formatAbsoluteDate`) so
 * the server and the browser render the same string.
 *
 * @returns The human-readable period.
 */
export function formatReleasePeriod(
  release: SetRelease | undefined,
  options?: { month?: "long" | "short" },
): string {
  if (!release?.releasedAt || !release.precision) {
    return "TBA";
  }
  const { releasedAt, precision } = release;
  const month = options?.month ?? "long";
  const date = new Date(releasedAt);
  if (precision === "year") {
    return releasedAt.slice(0, 4);
  }
  if (precision === "quarter") {
    const quarter = QUARTER_LABELS[Math.floor((Number(releasedAt.slice(5, 7)) - 1) / 3)];
    return `${quarter} ${releasedAt.slice(0, 4)}`;
  }
  if (precision === "month") {
    return date.toLocaleDateString("en-US", { timeZone: "UTC", month, year: "numeric" });
  }
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month,
    year: "numeric",
  });
}
