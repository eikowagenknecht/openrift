import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

import type { BrowserCardDragData, DeckCardDragData, DeckDropData } from "./deck-dnd-context";
import { isDropRejected } from "./deck-dnd-context";

function browserCard(): BrowserCardDragData {
  return { type: "browser-card", card: { cardId: "card-1" } as DeckBuilderCard };
}

function deckCard(fromZone: DeckCardDragData["fromZone"]): DeckCardDragData {
  return {
    type: "deck-card",
    cardId: "card-1",
    cardName: "Annie, Fiery",
    fromZone,
    quantity: 2,
    preferredPrintingId: null,
  };
}

function zone(zoneId: DeckDropData["zone"], disabled?: boolean): DeckDropData {
  return { type: "deck-zone", zone: zoneId, ...(disabled === undefined ? {} : { disabled }) };
}

describe("isDropRejected", () => {
  it("accepts a browser card on an enabled zone", () => {
    expect(isDropRejected(browserCard(), zone(WellKnown.deckZone.MAIN))).toBe(false);
  });

  it("rejects a browser card on a disabled zone", () => {
    // Regression: a Custom Region deck with a leftover sideboard renders the
    // sideboard tile as banned (disabled droppable). Dropping a browser card
    // there must be a no-op, exactly like dropping a deck card there.
    expect(isDropRejected(browserCard(), zone(WellKnown.deckZone.SIDEBOARD, true))).toBe(true);
  });

  it("rejects a deck card on a disabled zone", () => {
    expect(
      isDropRejected(deckCard(WellKnown.deckZone.MAIN), zone(WellKnown.deckZone.CHAMPION, true)),
    ).toBe(true);
  });

  it("rejects a deck card dropped back onto its own zone", () => {
    expect(isDropRejected(deckCard(WellKnown.deckZone.MAIN), zone(WellKnown.deckZone.MAIN))).toBe(
      true,
    );
  });

  it("rejects a deck card on a non-move zone", () => {
    expect(isDropRejected(deckCard(WellKnown.deckZone.MAIN), zone(WellKnown.deckZone.RUNES))).toBe(
      true,
    );
  });

  it("accepts a deck card moving between move zones", () => {
    expect(
      isDropRejected(deckCard(WellKnown.deckZone.MAIN), zone(WellKnown.deckZone.SIDEBOARD)),
    ).toBe(false);
  });
});
