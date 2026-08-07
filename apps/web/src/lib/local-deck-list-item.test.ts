import type { Card } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { LocalDeck } from "@/stores/local-decks-store";
import { stubCard } from "@/test/factories";

import { localDeckToListItem } from "./local-deck-list-item";

const cardsById: Record<string, Card> = {
  "legend-1": stubCard({ name: "My Legend", type: "legend", domains: ["fury"] }),
  "champ-1": stubCard({
    name: "My Champ",
    type: "unit",
    superTypes: ["champion"],
    domains: ["fury"],
  }),
  "unit-1": stubCard({ name: "Footsoldier", type: "unit", domains: ["fury"] }),
  "spell-1": stubCard({ name: "Zap", type: "spell", domains: ["mind"] }),
  "rune-1": stubCard({ name: "Rune", type: "rune", domains: ["fury"] }),
};

const ctx = {
  cardsById,
  cardTypeOrder: ["unit", "spell", "gear", "legend", "rune", "battlefield"],
  domainOrder: ["fury", "mind", "body", "calm", "chaos", "order"],
};

function localDeck(overrides: Partial<LocalDeck> = {}): LocalDeck {
  return {
    id: "local:test",
    name: "Test",
    description: "",
    format: WellKnown.deckFormat.CONSTRUCTED,
    formatConfig: null,
    cards: [],
    coverCardId: null,
    coverPrintingId: null,
    coverPosition: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("localDeckToListItem", () => {
  it("derives legend/champion, counts, and domains from the cards", () => {
    const item = localDeckToListItem(
      localDeck({
        cards: [
          { zone: "legend", cardId: "legend-1", quantity: 1, preferredPrintingId: null },
          { zone: "champion", cardId: "champ-1", quantity: 1, preferredPrintingId: null },
          { zone: "main", cardId: "unit-1", quantity: 3, preferredPrintingId: null },
          { zone: "main", cardId: "spell-1", quantity: 2, preferredPrintingId: null },
          { zone: "runes", cardId: "rune-1", quantity: 12, preferredPrintingId: null },
        ],
      }),
      ctx,
    );

    expect(item.legendCardId).toBe("legend-1");
    expect(item.championCardId).toBe("champ-1");
    // totalCards excludes overflow but includes runes (1 + 1 + 3 + 2 + 12).
    expect(item.totalCards).toBe(19);
    // typeCounts come only from main + champion, excluding legend/rune/battlefield.
    expect(item.typeCounts).toEqual([
      { cardType: "unit", count: 4 }, // champion (1) + unit-1 (3)
      { cardType: "spell", count: 2 },
    ]);
    // domains from main + champion only (rune zone is excluded).
    expect(item.domainDistribution).toEqual([
      { domain: "fury", count: 4 },
      { domain: "mind", count: 2 },
    ]);
  });

  it("carries metadata constants and timestamps onto the synthesized deck", () => {
    const item = localDeckToListItem(localDeck({ id: "local:abc", name: "Aggro" }), ctx);
    expect(item.deck).toMatchObject({
      id: "local:abc",
      name: "Aggro",
      isPinned: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(item.totalValueCents).toBeNull();
  });

  it("treats non-constructed formats as valid in the list", () => {
    const item = localDeckToListItem(localDeck({ format: WellKnown.deckFormat.FREEFORM }), ctx);
    expect(item.isValid).toBe(true);
  });

  it("reports an empty constructed deck as invalid", () => {
    const item = localDeckToListItem(localDeck({ format: WellKnown.deckFormat.CONSTRUCTED }), ctx);
    expect(item.isValid).toBe(false);
  });
});
