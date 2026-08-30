import type { MetaDeckCardIndexResponse } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let cardIndex: MetaDeckCardIndexResponse = { cards: [], decks: [] };
let printingsByCardId = new Map<string, { id: string }[]>();
let ownedByPrinting: Record<string, number> | undefined = {};

vi.mock("@/hooks/use-meta", () => ({
  useMetaDeckCards: () => ({ data: cardIndex }),
}));
vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ printingsByCardId }),
}));
vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCount: () => ({ data: ownedByPrinting }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useMetaDeckOwnership } from "./use-meta-deck-ownership";

describe("useMetaDeckOwnership", () => {
  beforeEach(() => {
    cardIndex = {
      cards: ["card-a", "card-b"],
      decks: [
        { deckId: "deck-1", entries: [0, 2, 1, 1] },
        { deckId: "deck-2", entries: [1, 3] },
      ],
    };
    printingsByCardId = new Map([
      ["card-a", [{ id: "print-a1" }, { id: "print-a2" }]],
      ["card-b", [{ id: "print-b1" }]],
    ]);
    ownedByPrinting = {};
  });

  it("matches copies to cards across their printings", () => {
    ownedByPrinting = { "print-a1": 1, "print-a2": 1, "print-b1": 1 };
    const { result } = renderHook(() => useMetaDeckOwnership());
    expect(result.current?.get("deck-1")).toEqual({ owned: 3, needed: 3 });
    expect(result.current?.get("deck-2")).toEqual({ owned: 1, needed: 3 });
  });

  it("reports an empty collection as owning none of the archive", () => {
    const { result } = renderHook(() => useMetaDeckOwnership());
    expect(result.current?.get("deck-1")).toEqual({ owned: 0, needed: 3 });
  });

  it("stays undefined until the copies arrive, so nothing reads as unowned early", () => {
    ownedByPrinting = undefined;
    const { result } = renderHook(() => useMetaDeckOwnership());
    expect(result.current).toBeUndefined();
  });
});
