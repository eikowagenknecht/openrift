import type { FilterRange } from "./types/search.js";
import { NONE } from "./types/search.js";

/**
 * A null value fails any non-empty range unless `min` is `NONE` (-1), which
 * opts null-stat cards in; `max === NONE` then blocks every non-null value.
 */
export function matchesRange(value: number | null, range: FilterRange): boolean {
  if (range.min === null && range.max === null) {
    return true;
  }
  if (value === null) {
    return range.min === NONE;
  }
  if (range.max === NONE) {
    return false;
  }
  if (range.min !== null && range.min !== NONE && value < range.min) {
    return false;
  }
  if (range.max !== null && value > range.max) {
    return false;
  }
  return true;
}

export function includes<T>(allowed: T[], value: T): boolean {
  return allowed.length === 0 || allowed.includes(value);
}

export function overlaps<T>(allowed: T[], values: T[]): boolean {
  return allowed.length === 0 || values.some((v) => allowed.includes(v));
}

export function notExcluded<T>(excluded: T[], value: T): boolean {
  return excluded.length === 0 || !excluded.includes(value);
}

export function noneExcluded<T>(excluded: T[], values: readonly T[]): boolean {
  return excluded.length === 0 || !values.some((v) => excluded.includes(v));
}

/** 0 selected = all, 1 selected = any card with that domain, 2+ = domains must all be within the set. */
export function matchesDomains<T>(allowed: T[], values: T[]): boolean {
  if (allowed.length === 0) {
    return true;
  }
  if (allowed.length === 1) {
    return values.some((v) => allowed.includes(v));
  }
  return values.every((v) => allowed.includes(v));
}

export function matchesFlag(filter: boolean | null, actual: boolean): boolean {
  return filter === null || actual === filter;
}

export function matchesMarkers(markerSlugs: string[], actualSlugs: readonly string[]): boolean {
  if (markerSlugs.length === 0) {
    return true;
  }
  return markerSlugs.some((slug) => actualSlugs.includes(slug));
}

export function matchesDistributionChannels(
  channelSlugs: string[],
  actualSlugs: readonly string[],
): boolean {
  if (channelSlugs.length === 0) {
    return true;
  }
  return channelSlugs.some((slug) => actualSlugs.includes(slug));
}

export function matchesCustomTags(filterSlugs: string[], actualSlugs: readonly string[]): boolean {
  if (filterSlugs.length === 0) {
    return true;
  }
  return filterSlugs.some((slug) => actualSlugs.includes(slug));
}
