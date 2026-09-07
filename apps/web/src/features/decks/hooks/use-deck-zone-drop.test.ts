import { WellKnown } from "@openrift/shared/well-known";
import { beforeEach, describe, expect, it } from "vitest";

import { isZoneDropRejected } from "@/features/decks/hooks/use-deck-zone-drop";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import type { DeckCardDragData } from "@/features/decks/lib/deck-dnd-data";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

beforeEach(() => {
  resetIdCounter();
});

function dragOf(card: DeckBuilderCard): DeckCardDragData {
  return {
    type: "deck-card",
    cardId: card.cardId,
    cardName: card.cardName,
    fromZone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  };
}

describe("isZoneDropRejected", () => {
  it("rejects nothing while no drag is in flight", () => {
    expect(
      isZoneDropRejected({
        dragData: undefined,
        zone: WellKnown.deckZone.MAIN,
        allCards: [],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(false);
  });

  it("rejects nothing when the dragged entry can't be found in the deck", () => {
    const card = stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN });
    expect(
      isZoneDropRejected({
        dragData: dragOf(card),
        zone: WellKnown.deckZone.MAIN,
        allCards: [],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(false);
  });

  it("accepts a unit moving into the main deck", () => {
    const card = stubDeckBuilderCard({ zone: WellKnown.deckZone.OVERFLOW, cardType: "unit" });
    expect(
      isZoneDropRejected({
        dragData: dragOf(card),
        zone: WellKnown.deckZone.MAIN,
        allCards: [card],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(false);
  });

  it("rejects a card the zone's type gate turns away", () => {
    const unit = stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN, cardType: "unit" });
    expect(
      isZoneDropRejected({
        dragData: dragOf(unit),
        zone: WellKnown.deckZone.RUNES,
        allCards: [unit],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(true);
  });

  it("rejects a drop that would break the copy cap", () => {
    const parked = stubDeckBuilderCard({ zone: WellKnown.deckZone.OVERFLOW, cardType: "unit" });
    const held = stubDeckBuilderCard({
      cardId: parked.cardId,
      zone: WellKnown.deckZone.MAIN,
      quantity: 3,
    });
    expect(
      isZoneDropRejected({
        dragData: dragOf(parked),
        zone: WellKnown.deckZone.MAIN,
        allCards: [parked, held],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(true);
  });

  it("rejects a second copy of a battlefield already on the field", () => {
    const battlefield = stubDeckBuilderCard({
      zone: WellKnown.deckZone.BATTLEFIELD,
      cardType: "battlefield",
    });
    expect(
      isZoneDropRejected({
        dragData: dragOf(battlefield),
        zone: WellKnown.deckZone.BATTLEFIELD,
        allCards: [battlefield],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(true);
  });

  it("rejects a rune once the twelve-rune cap is reached", () => {
    const rune = stubDeckBuilderCard({
      zone: WellKnown.deckZone.RUNES,
      cardType: "rune",
      quantity: 12,
    });
    expect(
      isZoneDropRejected({
        dragData: dragOf(rune),
        zone: WellKnown.deckZone.RUNES,
        allCards: [rune],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(true);
  });

  it("keeps the capacity caps out of freeform", () => {
    const parked = stubDeckBuilderCard({ zone: WellKnown.deckZone.OVERFLOW, cardType: "unit" });
    const held = stubDeckBuilderCard({
      cardId: parked.cardId,
      zone: WellKnown.deckZone.MAIN,
      quantity: 3,
    });
    expect(
      isZoneDropRejected({
        dragData: dragOf(parked),
        zone: WellKnown.deckZone.MAIN,
        allCards: [parked, held],
        format: WellKnown.deckFormat.FREEFORM,
      }),
    ).toBe(false);
  });

  it("reads a card dragged in from the browser off the payload itself", () => {
    const card = stubDeckBuilderCard({ cardType: "unit" });
    expect(
      isZoneDropRejected({
        dragData: { type: "browser-card", card },
        zone: WellKnown.deckZone.RUNES,
        allCards: [],
        format: WellKnown.deckFormat.CONSTRUCTED,
      }),
    ).toBe(true);
  });
});
