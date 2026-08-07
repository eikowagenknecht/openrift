import { describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import {
  buildOwnershipRows,
  buildRarityByCardKey,
  buildRarityRows,
  ownershipFocusKeys,
  RARITY_LENS_COLORS,
  rarityFocusKeys,
  rarityLensSeries,
} from "@/lib/deck-stat-lenses";

function card(overrides: Partial<DeckBuilderCard> & { cardId: string }): DeckBuilderCard {
  return {
    zone: "main",
    quantity: 1,
    preferredPrintingId: null,
    cardName: overrides.cardId,
    cardType: "unit",
    cardTypes: ["unit"],
    superTypes: [],
    domains: ["fury"],
    tags: [],
    keywords: [],
    maxCopiesOverride: null,
    banned: false,
    energy: 1,
    might: null,
    power: 1,
    ...overrides,
  } as DeckBuilderCard;
}

const RARITY_ORDER = ["common", "rare", "epic"];
const RARITY_LABELS = { common: "Common", rare: "Rare", epic: "Epic" };

describe("buildRarityByCardKey", () => {
  it("maps entries via the resolver and skips unresolved ones", () => {
    const cards = [card({ cardId: "a" }), card({ cardId: "b" })];
    const map = buildRarityByCardKey(cards, (entry) => (entry.cardId === "a" ? "rare" : undefined));
    expect(map.get(getDeckCardKey(cards[0]))).toBe("rare");
    expect(map.has(getDeckCardKey(cards[1]))).toBe(false);
  });
});

describe("buildRarityRows", () => {
  const cards = [
    card({ cardId: "a", quantity: 3 }),
    card({ cardId: "b", quantity: 2 }),
    card({ cardId: "c", quantity: 1, zone: "champion" }),
    // Outside the population: never counted.
    card({ cardId: "d", quantity: 4, zone: "sideboard" }),
  ];
  const rarities = new Map([
    [getDeckCardKey(cards[0]), "common"],
    [getDeckCardKey(cards[1]), "rare"],
    [getDeckCardKey(cards[2]), "rare"],
    [getDeckCardKey(cards[3]), "epic"],
  ]);

  it("counts main and champion cards into enum-ordered single-segment rows", () => {
    const rows = buildRarityRows(cards, rarities, RARITY_ORDER, RARITY_LABELS);
    expect(rows.map((row) => row.key)).toEqual(["common", "rare"]);
    expect(rows[0].total).toBe(3);
    expect(rows[1].total).toBe(3);
    expect(rows[1].label).toBe("3 Rare");
    expect(rows[1].segments).toEqual({ rare: 3 });
  });

  it("skips entries with no resolved rarity", () => {
    expect(
      buildRarityRows([card({ cardId: "x" })], new Map(), RARITY_ORDER, RARITY_LABELS),
    ).toEqual([]);
  });
});

describe("rarityLensSeries", () => {
  it("colors each row from the rarity palette, in row order", () => {
    const rows = buildRarityRows(
      [card({ cardId: "a", quantity: 2 })],
      new Map([[getDeckCardKey(card({ cardId: "a", quantity: 2 })), "rare"]]),
      RARITY_ORDER,
      RARITY_LABELS,
    );
    const series = rarityLensSeries(rows, RARITY_LABELS);
    expect(series).toEqual([{ key: "rare", label: "Rare", color: RARITY_LENS_COLORS.rare }]);
  });

  it("falls back to a neutral color for a rarity the palette doesn't know", () => {
    const series = rarityLensSeries(
      [{ key: "mythic", label: "1 Mythic", total: 1, segments: { mythic: 1 } }],
      { mythic: "Mythic" },
    );
    expect(series[0].color).toBe("var(--color-muted-foreground)");
  });
});

describe("buildOwnershipRows", () => {
  const cards = [
    card({ cardId: "a", quantity: 3 }),
    card({ cardId: "b", quantity: 2, zone: "champion" }),
    card({ cardId: "c", quantity: 4, zone: "sideboard" }),
  ];
  const segments = new Map<string, OwnershipBandSegments>([
    [getDeckCardKey(cards[0]), { exact: 2, other: 0, missing: 1 }],
    [getDeckCardKey(cards[1]), { exact: 0, other: 2, missing: 0 }],
    // Sideboard entry must not count even though it has segments.
    [getDeckCardKey(cards[2]), { exact: 4, other: 0, missing: 0 }],
  ]);

  it("sums copies per class over the main deck and champion only", () => {
    const rows = buildOwnershipRows(cards, segments);
    expect(rows.map((row) => [row.key, row.total])).toEqual([
      ["exact", 2],
      ["other", 2],
      ["missing", 1],
    ]);
  });

  it("keeps zero-count classes as zero rows", () => {
    const rows = buildOwnershipRows([cards[0]], segments);
    expect(rows.find((row) => row.key === "other")?.total).toBe(0);
  });

  it("skips entries the segment map doesn't cover", () => {
    const rows = buildOwnershipRows([card({ cardId: "unknown", quantity: 5 })], segments);
    expect(rows.every((row) => row.total === 0)).toBe(true);
  });
});

describe("focus key sets", () => {
  const cards = [
    card({ cardId: "a" }),
    card({ cardId: "b" }),
    card({ cardId: "c", zone: "sideboard" }),
  ];

  it("rarityFocusKeys collects matching main-deck entries only", () => {
    const rarities = new Map([
      [getDeckCardKey(cards[0]), "rare"],
      [getDeckCardKey(cards[1]), "common"],
      [getDeckCardKey(cards[2]), "rare"],
    ]);
    expect(rarityFocusKeys(cards, rarities, "rare")).toEqual(new Set([getDeckCardKey(cards[0])]));
  });

  it("ownershipFocusKeys matches entries with at least one copy in the class", () => {
    const segments = new Map<string, OwnershipBandSegments>([
      [getDeckCardKey(cards[0]), { exact: 2, other: 0, missing: 1 }],
      [getDeckCardKey(cards[1]), { exact: 1, other: 0, missing: 0 }],
    ]);
    expect(ownershipFocusKeys(cards, segments, "missing")).toEqual(
      new Set([getDeckCardKey(cards[0])]),
    );
    expect(ownershipFocusKeys(cards, segments, "exact")).toEqual(
      new Set([getDeckCardKey(cards[0]), getDeckCardKey(cards[1])]),
    );
  });
});
