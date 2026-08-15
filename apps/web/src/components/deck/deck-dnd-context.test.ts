import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { stubDeckBuilderCard } from "@/test/factories";

import type { BrowserCardDragData, DeckCardDragData, DeckDropData } from "./deck-dnd-context";
import {
  DRAG_SOURCE_ZONES,
  edgeScrollDelta,
  isDropRejected,
  isPointInRect,
  resolveDraggedCard,
} from "./deck-dnd-context";

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

  it("looks a deck drag up in its source zone", () => {
    // Same card in two zones: the copy in the drag's fromZone is the one whose
    // quantity the fullness checks must read.
    expect(resolveDraggedCard(deckCard(WellKnown.deckZone.MAIN), [inSideboard, inMain])).toBe(
      inMain,
    );
  });

  it("returns nothing when the dragged card has left its source zone", () => {
    expect(resolveDraggedCard(deckCard(WellKnown.deckZone.OVERFLOW), [inMain])).toBeUndefined();
  });

  it("picks the row whose printing the drag names", () => {
    // One card, one zone, two rows — a deck may hold the same card under two
    // printings, and they carry separate quantities. Matching on card + zone
    // alone returns whichever row sorts first, which is the wrong quantity for
    // the copy limit checks half the time.
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
    // Single-slot zones are set by picking a card, not by dragging one out.
    expect(DRAG_SOURCE_ZONES.has(WellKnown.deckZone.LEGEND)).toBe(false);
    expect(DRAG_SOURCE_ZONES.has(WellKnown.deckZone.RUNES)).toBe(false);
  });
});

// A 500px-tall container showing 500 of 1500px, scrolled to the middle.
function container(overrides?: Partial<Parameters<typeof edgeScrollDelta>[0]>) {
  return {
    pointerY: 250,
    top: 0,
    bottom: 500,
    scrollTop: 500,
    scrollHeight: 1500,
    clientHeight: 500,
    ...overrides,
  };
}

describe("edgeScrollDelta", () => {
  it("stays still while the pointer is away from both edges", () => {
    expect(edgeScrollDelta(container())).toBe(0);
  });

  it("scrolls up near the top edge", () => {
    expect(edgeScrollDelta(container({ pointerY: 10 }))).toBeLessThan(0);
  });

  it("scrolls down near the bottom edge", () => {
    expect(edgeScrollDelta(container({ pointerY: 490 }))).toBeGreaterThan(0);
  });

  it("speeds up the closer the pointer gets to an edge", () => {
    const near = edgeScrollDelta(container({ pointerY: 495 }));
    const far = edgeScrollDelta(container({ pointerY: 470 }));
    expect(near).toBeGreaterThan(far);
  });

  it("caps the speed for a pointer past the edge", () => {
    const atEdge = edgeScrollDelta(container({ pointerY: 500 }));
    const beyond = edgeScrollDelta(container({ pointerY: 900 }));
    expect(beyond).toBe(atEdge);
  });

  it("does not scroll up when already at the top", () => {
    expect(edgeScrollDelta(container({ pointerY: 10, scrollTop: 0 }))).toBe(0);
  });

  it("does not scroll down when already at the bottom", () => {
    expect(edgeScrollDelta(container({ pointerY: 490, scrollTop: 1000 }))).toBe(0);
  });

  it("ignores containers with nothing to scroll", () => {
    expect(edgeScrollDelta(container({ pointerY: 490, scrollTop: 0, scrollHeight: 500 }))).toBe(0);
  });
});

describe("isPointInRect", () => {
  const rect = { top: 100, right: 400, bottom: 300, left: 200 };

  it("accepts a point inside", () => {
    expect(isPointInRect(300, 200, rect)).toBe(true);
  });

  it("accepts a point on the edge", () => {
    expect(isPointInRect(200, 100, rect)).toBe(true);
  });

  it("rejects points outside on every side", () => {
    expect(isPointInRect(199, 200, rect)).toBe(false);
    expect(isPointInRect(401, 200, rect)).toBe(false);
    expect(isPointInRect(300, 99, rect)).toBe(false);
    expect(isPointInRect(300, 301, rect)).toBe(false);
  });
});
