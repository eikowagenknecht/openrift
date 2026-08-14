import type { MetaListStatus } from "@openrift/shared";

/**
 * How much of a pilot's list the archive holds, in the words the archive uses
 * for it. Only the two incomplete states are ever labelled: a full list is what
 * a reader already assumes, so marking it would put a badge on every deck.
 */
export const META_LIST_STATUS_LABELS: Record<MetaListStatus, string> = {
  full: "Full list",
  partial: "Partial list",
  archetype: "Archetype only",
};

/**
 * Renders a Meta Archive finish tier for display (ADR-014).
 *
 * Tiers 1-3 are podium ordinals; everything from 4 up is a top-cut bucket
 * ("T4", "T8", ...). Ties within an event share a tier and render identically.
 *
 * @param tier - The finish tier (1, 2, 3, 4, 8, 16, ...; lower is better).
 * @returns The display label, e.g. "1st", "2nd", "3rd", "T8".
 */
export function formatFinishTier(tier: number): string {
  const podium: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };
  return podium[tier] ?? `T${tier}`;
}
