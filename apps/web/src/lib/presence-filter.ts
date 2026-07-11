import type { PresenceDimension } from "@openrift/shared";

/** A presence dimension's URL-param value: require any, require none, or unset. */
export type PresenceParamValue = "any" | "none" | null;

/**
 * Maps a presence param value to the shared tri-state flag look used across the
 * filter chrome (FlagBadge / FlagMenuItem / combobox flag row): "any" shows a
 * check (require at least one value), "none" a minus (require none), null off.
 * @returns The tri-state: true = require any, false = require none, null = off.
 */
export function presenceToFlagState(value: PresenceParamValue): boolean | null {
  return value === "any" ? true : value === "none" ? false : null;
}

/**
 * The faceted count to show beside a presence control, matching the state it
 * currently advertises (the "none" count while forbidding, the "any" count
 * otherwise).
 * @returns The count, or undefined when counts aren't loaded.
 */
export function presenceFlagCount(
  counts: { any: number; none: number } | undefined,
  state: boolean | null,
): number | undefined {
  if (!counts) {
    return undefined;
  }
  return state === false ? counts.none : counts.any;
}

/** User-facing label for each presence dimension's control ("Has any …"). */
export const PRESENCE_LABELS: Record<PresenceDimension, string> = {
  markers: "Has any marker",
  superTypes: "Has any supertype",
  customTags: "Has any custom tag",
  distributionChannels: "Has any distribution channel",
  keywords: "Has any keyword",
  tags: "Has any tag",
};
