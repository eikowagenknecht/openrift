import { WellKnown } from "@openrift/shared/well-known";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cardInteractiveProps, deckCardDragData } from "@/lib/deck-card-interaction";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

beforeEach(() => {
  resetIdCounter();
});

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLDivElement>;
}

describe("cardInteractiveProps", () => {
  it("adds nothing when the surface has no click target", () => {
    expect(cardInteractiveProps(stubDeckBuilderCard())).toEqual({});
  });

  it("makes the element a focusable button when it does", () => {
    const props = cardInteractiveProps(stubDeckBuilderCard(), vi.fn());
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    expect(props.onClick).toBeDefined();
    expect(props.onKeyDown).toBeDefined();
  });

  it("opens the card on click", () => {
    const onCardClick = vi.fn();
    const card = stubDeckBuilderCard();
    cardInteractiveProps(card, onCardClick).onClick?.({} as React.MouseEvent<HTMLDivElement>);
    expect(onCardClick).toHaveBeenCalledWith(card);
  });

  it("opens the card on Enter and Space, swallowing the page scroll", () => {
    const card = stubDeckBuilderCard();
    for (const key of ["Enter", " "]) {
      const onCardClick = vi.fn();
      const event = keyEvent(key);
      cardInteractiveProps(card, onCardClick).onKeyDown?.(event);
      expect(onCardClick).toHaveBeenCalledWith(card);
      expect(event.preventDefault).toHaveBeenCalled();
    }
  });

  it("leaves every other key alone", () => {
    const onCardClick = vi.fn();
    const event = keyEvent("Tab");
    cardInteractiveProps(stubDeckBuilderCard(), onCardClick).onKeyDown?.(event);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("deckCardDragData", () => {
  it("identifies the row the card was lifted from", () => {
    const card = stubDeckBuilderCard({
      zone: WellKnown.deckZone.MAIN,
      quantity: 2,
      preferredPrintingId: "printing-1",
    });
    expect(deckCardDragData(card, WellKnown.deckZone.MAIN, "Ahri")).toEqual({
      type: "deck-card",
      cardId: card.cardId,
      cardName: "Ahri",
      fromZone: WellKnown.deckZone.MAIN,
      quantity: 2,
      preferredPrintingId: "printing-1",
    });
  });

  it("takes the source zone from the caller, not the card's stored zone", () => {
    const card = stubDeckBuilderCard({ zone: WellKnown.deckZone.MAIN });
    expect(deckCardDragData(card, WellKnown.deckZone.SIDEBOARD, "Ahri").fromZone).toBe(
      WellKnown.deckZone.SIDEBOARD,
    );
  });

  it("carries default art through as a null printing", () => {
    const card = stubDeckBuilderCard({ preferredPrintingId: null });
    expect(deckCardDragData(card, WellKnown.deckZone.MAIN, "Ahri").preferredPrintingId).toBeNull();
  });
});
