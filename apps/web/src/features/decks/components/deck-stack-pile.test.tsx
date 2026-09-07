import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CARD_HEIGHT_RATIO } from "@/features/decks/components/deck-overview-geometry";
import { stubDeckBuilderCard } from "@/test/factories";

let coarsePointer = false;

vi.mock("@/hooks/use-coarse-pointer", () => ({
  useCoarsePointer: () => coarsePointer,
}));

const { StackPile } = await import("./deck-stack-pile");

const CARDS = [
  stubDeckBuilderCard({ cardId: "card-a", cardName: "Ashe" }),
  stubDeckBuilderCard({ cardId: "card-b", cardName: "Braum" }),
];

const EXPANDED_HEIGHT = `calc(var(--deck-card-w) * ${CARD_HEIGHT_RATIO})`;

function renderPile(onCardClick: (card: { cardId: string }) => void) {
  render(
    <StackPile
      deckId="deck-1"
      entries={CARDS.map((card) => ({ card, copyIndex: null }))}
      zone="main"
      bandByCardKey={new Map()}
      priceTextByCardKey={new Map()}
      addRoomByCardKey={new Map()}
      resolveHoverPrintingId={() => null}
      statsFocus={null}
      getThumbnail={(cardId) => `/images/${cardId}.webp`}
      readOnly
      onCardClick={onCardClick}
    />,
  );
}

const strip = (name: string) => screen.getByRole("button", { name });

describe("StackPile on touch", () => {
  beforeEach(() => {
    coarsePointer = true;
  });

  it("unfolds a buried strip on the first tap instead of opening the card", () => {
    const onCardClick = vi.fn();
    renderPile(onCardClick);

    expect(strip("Braum").style.height).not.toBe(EXPANDED_HEIGHT);
    fireEvent.click(strip("Braum"));

    expect(onCardClick).not.toHaveBeenCalled();
    expect(strip("Braum").style.height).toBe(EXPANDED_HEIGHT);
  });

  it("opens the card when the unfolded strip is tapped again", () => {
    const onCardClick = vi.fn();
    renderPile(onCardClick);

    fireEvent.click(strip("Braum"));
    fireEvent.click(strip("Braum"));

    expect(onCardClick).toHaveBeenCalledTimes(1);
    expect(onCardClick.mock.calls[0]![0]).toMatchObject({ cardId: "card-b" });
  });

  it("moves the unfolded strip to the card tapped next", () => {
    const onCardClick = vi.fn();
    renderPile(onCardClick);

    fireEvent.click(strip("Braum"));
    fireEvent.click(strip("Ashe"));

    expect(onCardClick).not.toHaveBeenCalled();
    expect(strip("Ashe").style.height).toBe(EXPANDED_HEIGHT);
    expect(strip("Braum").style.height).not.toBe(EXPANDED_HEIGHT);
  });

  // A tap fires a synthetic mousemove first, which would unfold the strip
  // before the click and make that same tap look like the second one.
  it("ignores the synthetic mousemove a tap fires", () => {
    const onCardClick = vi.fn();
    renderPile(onCardClick);

    const pile = strip("Braum").parentElement;
    if (!pile) {
      throw new Error("pile did not render");
    }
    fireEvent.mouseMove(pile, { clientX: 0, clientY: 200 });

    expect(strip("Braum").style.height).not.toBe(EXPANDED_HEIGHT);
  });
});

describe("StackPile with a mouse", () => {
  beforeEach(() => {
    coarsePointer = false;
  });

  it("opens the card on the first click", () => {
    const onCardClick = vi.fn();
    renderPile(onCardClick);

    fireEvent.click(strip("Braum"));

    expect(onCardClick).toHaveBeenCalledTimes(1);
    expect(onCardClick.mock.calls[0]![0]).toMatchObject({ cardId: "card-b" });
  });
});
