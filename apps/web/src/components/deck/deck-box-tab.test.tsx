import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckBoxPlan } from "@/lib/deck-box";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}));

const plan: DeckBoxPlan = {
  neededTotal: 0,
  inBoxTotal: 0,
  slots: [],
  missingCount: 0,
  extras: [
    {
      card: { cardId: "card-1", name: "Jinx", types: ["unit"], tags: [], domains: ["fury"] },
      copies: [
        {
          copyId: "copy-1",
          printingId: "printing-1",
          shortCode: "OGN-042",
          rarity: "common",
          imageId: null,
          condition: null,
          grade: null,
          collectionId: "shelf",
          collectionName: "Shelf",
          language: "EN",
          artVariant: "standard",
          finish: "standard",
          size: "standard",
          isSigned: false,
          markers: [],
        },
      ],
    },
  ],
  extraCount: 1,
  siblingPrintingsByCardId: new Map(),
};

const mutate = vi.fn();

vi.mock("@/hooks/use-deck-box", () => ({ useDeckBox: () => plan }));
vi.mock("@/hooks/use-copies", () => ({ useMoveCopies: () => ({ mutate, isPending: false }) }));
vi.mock("@/hooks/use-collections", () => ({
  useCollections: () => ({ data: [{ id: "inbox", name: "Inbox", isInbox: true }] }),
}));
vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({ fury: "#cb212d" }) }));
vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    labels: { rarities: {}, finishes: {}, artVariants: {}, cardSizes: {}, conditions: {} },
  }),
}));

const { DeckBoxTab } = await import("./deck-box-tab");

function renderTab(onCardClick: () => void) {
  render(
    <DeckBoxTab
      deckId="deck-1"
      cards={[]}
      homeCollectionId="box"
      homeCollectionName="Deck box"
      sortCards={(zoneCards) => zoneCards}
      groupCards={() => []}
      groupBy="type"
      onCardClick={onCardClick}
    />,
  );
}

describe("DeckBoxTab", () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it("opens the card detail when the row itself is clicked", () => {
    const onCardClick = vi.fn();
    renderTab(onCardClick);

    fireEvent.click(screen.getByRole("button", { name: /Jinx/u }));

    expect(onCardClick).toHaveBeenCalledWith({
      cardId: "card-1",
      preferredPrintingId: "printing-1",
    });
  });

  it("sweeps a surplus copy into the inbox without opening the card", () => {
    const onCardClick = vi.fn();
    renderTab(onCardClick);

    fireEvent.click(screen.getByRole("button", { name: "Move out" }));

    expect(mutate).toHaveBeenCalledWith({ copyIds: ["copy-1"], toCollectionId: "inbox" });
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
