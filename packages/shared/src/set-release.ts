/**
 * Release status must be derived from the date, never stored as a separate
 * flag, or the two could disagree.
 */

import { formatDay, formatMonth } from "./format-date.js";

export type ReleasePrecision = "day" | "month" | "quarter" | "year";

/** releasedAt is the period's first day; precision says how wide. Both null means announced with no date yet. */
export interface SetRelease {
  releasedAt: string | null;
  precision: ReleasePrecision | null;
}

/** A set's releases keyed by language code. A missing key means not announced. */
export type SetReleases = Record<string, SetRelease>;

// UTC on purpose: SSR and hydration must agree on "today", and comparing a
// UTC server against a browser's local timezone would cause a React #418.
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  // this needs no leap-year special case.
  const endMonth = precision === "year" ? 12 : precision === "quarter" ? month + 2 : month;
  return new Date(Date.UTC(year, endMonth, 0)).toISOString().slice(0, 10);
}

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

// Compares against the period's end, so a set stays "unreleased" until its
// full period passes. Being late is the safe direction under the Riot license.
export function isReleased(release: SetRelease | undefined, today = todayUtc()): boolean {
  if (!release) {
    return false;
  }
  const end = releasePeriodEnd(release);
  return end !== null && end <= today;
}

export function isReleasedIn(releases: SetReleases, language: string, today = todayUtc()): boolean {
  return isReleased(releases[language], today);
}

export function earliestRelease(releases: SetReleases): SetRelease | undefined {
  let earliest: SetRelease | undefined;
  for (const release of Object.values(releases)) {
    if (release.releasedAt && (!earliest?.releasedAt || release.releasedAt < earliest.releasedAt)) {
      earliest = release;
    }
  }
  return earliest;
}

export function isReleasedAnywhere(releases: SetReleases, today = todayUtc()): boolean {
  return Object.values(releases).some((release) => isReleased(release, today));
}

export function formatReleasePeriod(release: SetRelease | undefined): string {
  if (!release?.releasedAt || !release.precision) {
    return "TBA";
  }
  const { releasedAt, precision } = release;
  const year = releasedAt.slice(0, 4);
  if (precision === "year") {
    return year;
  }
  if (precision === "quarter") {
    return `${year}-Q${Math.floor((Number(releasedAt.slice(5, 7)) - 1) / 3) + 1}`;
  }
  if (precision === "month") {
    return formatMonth(releasedAt);
  }
  return formatDay(releasedAt);
}
