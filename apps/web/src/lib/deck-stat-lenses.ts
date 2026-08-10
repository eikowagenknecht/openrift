import type { DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";

/** One series (stack segment source) of a categorical stats chart. */
export interface LensSeries {
  key: string;
  label: string;
  color: string;
}

/** One column of a categorical stats chart. */
export interface LensRow {
  /** Stable value handed to click handlers (rarity slug, ownership class). */
  key: string;
  /** X-axis display label, e.g. "12 Rare" or "Owned". */
  label: string;
  total: number;
  /** Series key → count. Missing keys count as 0. */
  segments: Record<string, number>;
}

/** The population every stats chart counts: main deck plus champion. */
const LENS_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.CHAMPION,
]);

/** The three collection-status classes, in band order. */
export type OwnershipClass = "exact" | "other" | "missing";

/**
 * Chart series for the ownership lens. Colors follow the app's collection
 * vocabulary: green for copies in the printing shown, sky for other printings,
 * amber for missing (the same amber as every "N missing" figure).
 */
export const OWNERSHIP_LENS_SERIES: readonly (LensSeries & { key: OwnershipClass })[] = [
  { key: "exact", label: "This printing", color: "var(--color-green-500)" },
  { key: "other", label: "Another printing", color: "var(--color-sky-500)" },
  { key: "missing", label: "Missing", color: "var(--color-amber-500)" },
];

/**
 * Maps each deck entry to the rarity its row stands for, via the caller's
 * resolver (owned printing while "show my printings" is on, the display
 * printing otherwise). Entries whose rarity can't be resolved are skipped.
 * @returns Deck card key → rarity slug.
 */
export function buildRarityByCardKey(
  cards: readonly DeckBuilderCard[],
  resolveRarity: (card: DeckBuilderCard) => string | undefined,
): Map<string, string> {
  const rarities = new Map<string, string>();
  for (const card of cards) {
    const rarity = resolveRarity(card);
    if (rarity !== undefined) {
      rarities.set(getDeckCardKey(card), rarity);
    }
  }
  return rarities;
}

/**
 * Chart colors for the rarity lens, sampled from the rarity icons
 * (apps/web/public/images/rarities/*.webp) so the columns speak the same
 * color language as every rarity glyph in the app. Distinct from the domain
 * palette on purpose: the Types chart next door is domain-stacked, and two
 * identically-colored neighbors read as one chart.
 */
export const RARITY_LENS_COLORS: Record<string, string> = {
  common: "#c5cba6",
  uncommon: "#439e9d",
  rare: "#ab107f",
  epic: "#e69332",
  showcase: "#f6d937",
};

/** True system boundary: a rarity added to the data before this map learns it. */
const RARITY_LENS_FALLBACK_COLOR = "var(--color-muted-foreground)";

/**
 * One chart series per rarity row, colored by {@link RARITY_LENS_COLORS}.
 * @returns The series, in the rows' order.
 */
export function rarityLensSeries(
  rows: readonly LensRow[],
  rarityLabels: Record<string, string>,
): LensSeries[] {
  return rows.map((row) => ({
    key: row.key,
    label: rarityLabels[row.key],
    color: RARITY_LENS_COLORS[row.key] ?? RARITY_LENS_FALLBACK_COLOR,
  }));
}

/**
 * Rarity columns for the stats band: one single-colored column per rarity, in
 * enum order. Population mirrors the other charts: main deck + champion.
 * @returns The rows; empty when no entry has a resolved rarity.
 */
export function buildRarityRows(
  cards: readonly DeckBuilderCard[],
  rarityByCardKey: ReadonlyMap<string, string>,
  rarityOrder: readonly string[],
  rarityLabels: Record<string, string>,
): LensRow[] {
  const totals = new Map<string, number>();
  for (const card of cards) {
    if (!LENS_ZONES.has(card.zone)) {
      continue;
    }
    const rarity = rarityByCardKey.get(getDeckCardKey(card));
    if (rarity === undefined) {
      continue;
    }
    totals.set(rarity, (totals.get(rarity) ?? 0) + card.quantity);
  }
  return rarityOrder
    .filter((rarity) => totals.has(rarity))
    .map((rarity) => {
      const total = totals.get(rarity) ?? 0;
      return {
        key: rarity,
        label: `${total} ${rarityLabels[rarity]}`,
        total,
        segments: { [rarity]: total },
      };
    });
}

/**
 * The three ownership columns for the stats band, in copies: how much of the
 * main deck (plus champion) the viewer holds in the printings shown, holds in
 * other printings, or is missing. Entries the segment map doesn't cover (the
 * catalog bridge hasn't resolved them) are skipped rather than guessed.
 * @returns One row per ownership class, zero-count rows included.
 */
export function buildOwnershipRows(
  cards: readonly DeckBuilderCard[],
  segmentsByCardKey: ReadonlyMap<string, OwnershipBandSegments>,
): LensRow[] {
  const totals: Record<OwnershipClass, number> = { exact: 0, other: 0, missing: 0 };
  for (const card of cards) {
    if (!LENS_ZONES.has(card.zone)) {
      continue;
    }
    const segments = segmentsByCardKey.get(getDeckCardKey(card));
    if (!segments) {
      continue;
    }
    totals.exact += segments.exact;
    totals.other += segments.other;
    // Locked copies count as missing here so the column matches every other
    // shortfall figure (hero chip, missing dialog); only the thumbnail band
    // splits them out.
    totals.missing += segments.missing + segments.locked;
  }
  return OWNERSHIP_LENS_SERIES.map((series) => ({
    key: series.key,
    label: `${totals[series.key]} ${series.label}`,
    total: totals[series.key],
    segments: { [series.key]: totals[series.key] },
  }));
}

/**
 * The deck entries a rarity-column focus covers, for the focus's key set.
 * @returns Keys of the matching entries (main deck + champion only).
 */
export function rarityFocusKeys(
  cards: readonly DeckBuilderCard[],
  rarityByCardKey: ReadonlyMap<string, string>,
  rarity: string,
): Set<string> {
  const keys = new Set<string>();
  for (const card of cards) {
    if (LENS_ZONES.has(card.zone) && rarityByCardKey.get(getDeckCardKey(card)) === rarity) {
      keys.add(getDeckCardKey(card));
    }
  }
  return keys;
}

/**
 * The deck entries an ownership-column focus covers: every entry with at least
 * one copy in the class. An entry can sit in several classes at once (2 owned,
 * 1 missing), so the sets of different classes may overlap.
 * @returns Keys of the matching entries (main deck + champion only).
 */
export function ownershipFocusKeys(
  cards: readonly DeckBuilderCard[],
  segmentsByCardKey: ReadonlyMap<string, OwnershipBandSegments>,
  ownershipClass: OwnershipClass,
): Set<string> {
  const keys = new Set<string>();
  for (const card of cards) {
    if (!LENS_ZONES.has(card.zone)) {
      continue;
    }
    const segments = segmentsByCardKey.get(getDeckCardKey(card));
    // Mirrors buildOwnershipRows: locked copies belong to the missing class.
    const count =
      ownershipClass === "missing"
        ? (segments?.missing ?? 0) + (segments?.locked ?? 0)
        : (segments?.[ownershipClass] ?? 0);
    if (count > 0) {
      keys.add(getDeckCardKey(card));
    }
  }
  return keys;
}
