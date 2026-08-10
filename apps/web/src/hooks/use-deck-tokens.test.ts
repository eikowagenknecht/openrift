import type { Card, Printing } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetIdCounter, stubCard, stubDeckBuilderCard, stubPrinting } from "@/test/factories";

let cardsById: Record<string, Card> = {};
const printingByCardId = new Map<string, Printing>();

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ cardsById }),
}));

vi.mock("@/hooks/use-preferred-printing", () => ({
  usePreferredPrinting: () => ({
    getPreferredPrinting: (cardId: string) => printingByCardId.get(cardId),
  }),
}));

const { useDeckTokens } = await import("./use-deck-tokens");

beforeEach(() => {
  resetIdCounter();
  cardsById = {};
  printingByCardId.clear();
});

/** Register a token card in the catalog, with a printing so it can render. */
function registerToken(cardId: string, name: string): void {
  cardsById[cardId] = stubCard({ name, superTypes: ["token"] });
  printingByCardId.set(cardId, stubPrinting({ cardId }));
}

/** Register an ordinary card that calls for the given tokens. */
function registerSource(cardId: string, name: string, tokenCardIds: string[]): void {
  cardsById[cardId] = stubCard({ name, tokenCardIds });
  printingByCardId.set(cardId, stubPrinting({ cardId }));
}

describe("useDeckTokens", () => {
  it("returns nothing for an empty deck", () => {
    const { result } = renderHook(() => useDeckTokens([]));
    expect(result.current).toEqual([]);
  });

  it("returns nothing when no card calls for a token", () => {
    registerSource("plain", "Plain Card", []);
    const { result } = renderHook(() =>
      useDeckTokens([stubDeckBuilderCard({ cardId: "plain", cardName: "Plain Card" })]),
    );
    expect(result.current).toEqual([]);
  });

  it("resolves a token to its card and printing", () => {
    registerToken("sprite", "Sprite");
    registerSource("summoner", "Sprite Mother", ["sprite"]);

    const { result } = renderHook(() =>
      useDeckTokens([stubDeckBuilderCard({ cardId: "summoner", cardName: "Sprite Mother" })]),
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].card.name).toBe("Sprite");
    expect(result.current[0].printing.cardId).toBe("sprite");
    expect(result.current[0].sourceNames).toEqual(["Sprite Mother"]);
  });

  it("orders tokens by name, not by deck order", () => {
    registerToken("sprite", "Sprite");
    registerToken("bird", "Bird");
    registerSource("both", "Aviary", ["sprite", "bird"]);

    const { result } = renderHook(() =>
      useDeckTokens([stubDeckBuilderCard({ cardId: "both", cardName: "Aviary" })]),
    );

    expect(result.current.map((entry) => entry.card.name)).toEqual(["Bird", "Sprite"]);
  });

  it("dedupes a token called for by several cards and lists every source", () => {
    registerToken("gold", "Gold");
    registerSource("draven", "Draven", ["gold"]);
    registerSource("cask", "Chemtech Cask", ["gold"]);

    const { result } = renderHook(() =>
      useDeckTokens([
        stubDeckBuilderCard({ cardId: "draven", cardName: "Draven" }),
        stubDeckBuilderCard({ cardId: "cask", cardName: "Chemtech Cask" }),
      ]),
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].sourceNames).toEqual(["Draven", "Chemtech Cask"]);
  });

  it("does not list the same source twice when it sits in two zones", () => {
    registerToken("gold", "Gold");
    registerSource("draven", "Draven", ["gold"]);

    const { result } = renderHook(() =>
      useDeckTokens([
        stubDeckBuilderCard({ cardId: "draven", cardName: "Draven", zone: "main" }),
        stubDeckBuilderCard({ cardId: "draven", cardName: "Draven", zone: "sideboard" }),
      ]),
    );

    expect(result.current[0].sourceNames).toEqual(["Draven"]);
  });

  it("collects tokens from every zone", () => {
    registerToken("sprite", "Sprite");
    registerToken("gold", "Gold");
    registerSource("main-card", "Main Card", ["sprite"]);
    registerSource("side-card", "Side Card", ["gold"]);

    const { result } = renderHook(() =>
      useDeckTokens([
        stubDeckBuilderCard({ cardId: "main-card", cardName: "Main Card", zone: "main" }),
        stubDeckBuilderCard({ cardId: "side-card", cardName: "Side Card", zone: "sideboard" }),
      ]),
    );

    expect(result.current.map((entry) => entry.card.name)).toEqual(["Gold", "Sprite"]);
  });

  it("skips a deck card the catalog doesn't know", () => {
    const { result } = renderHook(() =>
      useDeckTokens([stubDeckBuilderCard({ cardId: "missing", cardName: "Missing" })]),
    );
    expect(result.current).toEqual([]);
  });

  it("skips a token that has no printing to show", () => {
    cardsById["ghost"] = stubCard({ name: "Ghost", superTypes: ["token"] });
    registerSource("summoner", "Summoner", ["ghost"]);

    const { result } = renderHook(() =>
      useDeckTokens([stubDeckBuilderCard({ cardId: "summoner", cardName: "Summoner" })]),
    );

    expect(result.current).toEqual([]);
  });
});
