import { enumLabel } from "@openrift/shared/enum-label";
import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { getDeckCardKey } from "@/features/decks/lib/deck-builder-card";
import type { OwnershipBandSegments } from "@/features/decks/lib/deck-ownership-band";

export interface LensSeries {
  key: string;
  label: string;
  color: string;
}

export interface LensRow {
  key: string;
  label: string;
  total: number;
  segments: Record<string, number>;
}

const LENS_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.CHAMPION,
]);

export type OwnershipClass = "exact" | "other" | "borrowed" | "missing";

export const OWNERSHIP_LENS_SERIES: readonly (LensSeries & { key: OwnershipClass })[] = [
  { key: "exact", label: "This printing", color: "var(--color-green-500)" },
  { key: "other", label: "Another printing", color: "var(--color-sky-500)" },
  { key: "borrowed", label: "Borrowed", color: "var(--color-violet-500)" },
  { key: "missing", label: "Missing", color: "var(--color-amber-500)" },
];

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

// Deliberately distinct from the domain palette: two same-colored charts read as one.
export const RARITY_LENS_COLORS: Record<string, string> = {
  common: "#c5cba6",
  uncommon: "#439e9d",
  rare: "#ab107f",
  epic: "#e69332",
  showcase: "#f6d937",
};

// Fallback for a rarity not yet added to RARITY_LENS_COLORS.
const RARITY_LENS_FALLBACK_COLOR = "var(--color-muted-foreground)";

export function rarityLensSeries(
  rows: readonly LensRow[],
  rarityLabels: Record<string, string>,
): LensSeries[] {
  return rows.map((row) => ({
    key: row.key,
    label: enumLabel(rarityLabels, row.key),
    color: RARITY_LENS_COLORS[row.key] ?? RARITY_LENS_FALLBACK_COLOR,
  }));
}

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

// Entries the segment map doesn't cover are skipped, not guessed.
export function buildOwnershipRows(
  cards: readonly DeckBuilderCard[],
  segmentsByCardKey: ReadonlyMap<string, OwnershipBandSegments>,
): LensRow[] {
  const totals: Record<OwnershipClass, number> = { exact: 0, other: 0, borrowed: 0, missing: 0 };
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
    totals.borrowed += segments.borrowed;
    // Locked copies count as missing, matching every other shortfall figure.
    totals.missing += segments.missing + segments.locked;
  }
  return OWNERSHIP_LENS_SERIES.map((series) => ({
    key: series.key,
    label: `${totals[series.key]} ${series.label}`,
    total: totals[series.key],
    segments: { [series.key]: totals[series.key] },
  }));
}

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

// An entry can belong to several classes at once, so result sets may overlap.
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
