import { WellKnown } from "@openrift/shared/well-known";
import { describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { stubDeckBuilderCard } from "@/test/factories";

import type { BrowserCardDragData, DeckCardDragData, DeckDropData } from "./deck-dnd-data";
import { DRAG_SOURCE_ZONES, isDropRejected, resolveDraggedCard } from "./deck-dnd-data";

function browserCard(): BrowserCardDragData {
  return { type: "browser-card", card: { cardId: "card-1" } as DeckBuilderCard };
}

function deckCard(
  fromZone: DeckCardDragData["fromZone"],
  preferredPrintingId: string | null = null,
): DeckCardDragData {
  return {
    type: "deck-card",
    cardId: "card-1",
    cardName: "Annie, Fiery",
    fromZone,
    quantity: 2,
    preferredPrintingId,
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

describe("resolveDraggedCard", () => {
  const inMain = stubDeckBuilderCard({
    cardId: "card-1",
    zone: WellKnown.deckZone.MAIN,
    quantity: 3,
  });
  const inSideboard = stubDeckBuilderCard({
    cardId: "card-1",
    zone: WellKnown.deckZone.SIDEBOARD,
    quantity: 1,
  });

  it("returns nothing when no drag is in flight", () => {
    expect(resolveDraggedCard(undefined, [inMain])).toBeUndefined();
  });

  it("takes a browser drag's card straight from the payload", () => {
    const dragged = browserCard();
    expect(resolveDraggedCard(dragged, [])).toBe(dragged.card);
  });

  it("looks a deck drag up in its source zone, not any zone holding the same card", () => {
    expect(resolveDraggedCard(deckCard(WellKnown.deckZone.MAIN), [inSideboard, inMain])).toBe(
      inMain,
    );
  });

  it("returns nothing when the dragged card has left its source zone", () => {
    expect(resolveDraggedCard(deckCard(WellKnown.deckZone.OVERFLOW), [inMain])).toBeUndefined();
  });

  it("picks the row whose printing the drag names", () => {
    const alt = stubDeckBuilderCard({
      cardId: "card-1",
      zone: WellKnown.deckZone.MAIN,
      quantity: 1,
      preferredPrintingId: "printing-alt",
    });
    expect(
      resolveDraggedCard(deckCard(WellKnown.deckZone.MAIN, "printing-alt"), [inMain, alt]),
    ).toBe(alt);
  });

  it("picks the default-art row for a drag that names no printing", () => {
    const alt = stubDeckBuilderCard({
      cardId: "card-1",
      zone: WellKnown.deckZone.MAIN,
      quantity: 1,
      preferredPrintingId: "printing-alt",
    });
    expect(resolveDraggedCard(deckCard(WellKnown.deckZone.MAIN), [alt, inMain])).toBe(inMain);
  });

  it("returns nothing when no row carries the printing the drag names", () => {
    expect(
      resolveDraggedCard(deckCard(WellKnown.deckZone.MAIN, "printing-gone"), [inMain]),
    ).toBeUndefined();
  });
});

describe("DRAG_SOURCE_ZONES", () => {
  it("covers the re-homeable zones only", () => {
    expect(DRAG_SOURCE_ZONES.has(WellKnown.deckZone.MAIN)).toBe(true);
    expect(DRAG_SOURCE_ZONES.has(WellKnown.deckZone.SIDEBOARD)).toBe(true);
    expect(DRAG_SOURCE_ZONES.has(WellKnown.deckZone.OVERFLOW)).toBe(true);
    expect(DRAG_SOURCE_ZONES.has(WellKnown.deckZone.LEGEND)).toBe(false);
    expect(DRAG_SOURCE_ZONES.has(WellKnown.deckZone.RUNES)).toBe(false);
  });
});
