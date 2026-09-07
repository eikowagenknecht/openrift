import type { Card, DeckCardResponse, DeckZone } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubCard } from "@/test/factories";

import type { DeckDiffCard } from "./deck-diff";
import { deckDiffCardsFrom, diffDecks } from "./deck-diff";

function card(
  cardId: string,
  quantity: number,
  zone: DeckZone = "main",
  cardName = cardId,
): DeckDiffCard {
  return { cardId, cardName, zone, quantity };
}

function deckCard(cardId: string, quantity: number, zone: DeckZone = "main"): DeckCardResponse {
  return { cardId, zone, quantity, preferredPrintingId: null };
}

function catalog(names: Record<string, string>): Record<string, Card> {
  const entries = Object.entries(names).map(
    ([cardId, name]) => [cardId, stubCard({ name })] as const,
  );
  return Object.fromEntries(entries);
}

describe("diffDecks", () => {
  it("reports no differences for identical decks", () => {
    const cards = [card("a", 3), card("b", 2, "sideboard")];

    const diff = diffDecks(cards, cards);

    expect(diff.zones).toEqual([]);
    expect(diff.addCount).toBe(0);
    expect(diff.cutCount).toBe(0);
    expect(diff.sharedCount).toBe(5);
  });

  it("sums split printings of the same card in the same zone", () => {
    const ours = [card("a", 1), card("a", 2)];
    const theirs = [card("a", 3)];

    const diff = diffDecks(ours, theirs);

    expect(diff.zones).toEqual([]);
    expect(diff.sharedCount).toBe(3);
  });

  it("classifies adds, cuts, and changes", () => {
    const ours = [card("only-ours", 2), card("both", 3)];
    const theirs = [card("only-theirs", 1), card("both", 1)];

    const diff = diffDecks(ours, theirs);

    expect(diff.zones).toHaveLength(1);
    expect(diff.zones[0].zone).toBe("main");
    expect(diff.zones[0].entries).toEqual([
      { cardId: "only-theirs", cardName: "only-theirs", kind: "add", ours: 0, theirs: 1 },
      { cardId: "both", cardName: "both", kind: "change", ours: 3, theirs: 1 },
      { cardId: "only-ours", cardName: "only-ours", kind: "cut", ours: 2, theirs: 0 },
    ]);
  });

  it("counts a card that moved zones as a cut plus an add, not a change", () => {
    const ours = [card("a", 2, "main")];
    const theirs = [card("a", 2, "sideboard")];

    const diff = diffDecks(ours, theirs);

    expect(diff.zones.map((zone) => zone.zone)).toEqual(["main", "sideboard"]);
    expect(diff.zones[0].entries[0].kind).toBe("cut");
    expect(diff.zones[1].entries[0].kind).toBe("add");
    expect(diff.sharedCount).toBe(0);
    expect(diff.addCount).toBe(2);
    expect(diff.cutCount).toBe(2);
  });

  it("orders zones by the deck's display order", () => {
    const theirs = [
      card("m", 1, "main"),
      card("l", 1, "legend"),
      card("o", 1, "overflow"),
      card("c", 1, "champion"),
      card("b", 1, "battlefield"),
    ];

    const diff = diffDecks([], theirs);

    expect(diff.zones.map((zone) => zone.zone)).toEqual([
      "legend",
      "champion",
      "battlefield",
      "main",
      "overflow",
    ]);
  });

  it("sorts adds, then changes, then cuts, alphabetically within each kind", () => {
    const ours = [card("zed", 1), card("ahri", 1), card("jinx", 2), card("sett", 3)];
    const theirs = [card("jinx", 1), card("sett", 1), card("braum", 1), card("annie", 1)];

    const diff = diffDecks(ours, theirs);

    expect(diff.zones[0].entries.map((entry) => [entry.cardName, entry.kind])).toEqual([
      ["annie", "add"],
      ["braum", "add"],
      ["jinx", "change"],
      ["sett", "change"],
      ["ahri", "cut"],
      ["zed", "cut"],
    ]);
  });

  it("counts every copy as an add when our deck is empty", () => {
    const diff = diffDecks([], [card("a", 3), card("b", 1, "sideboard")]);

    expect(diff.addCount).toBe(4);
    expect(diff.cutCount).toBe(0);
    expect(diff.sharedCount).toBe(0);
    expect(diff.zones).toHaveLength(2);
  });

  it("counts every copy as a cut when the pasted list is empty", () => {
    const diff = diffDecks([card("a", 3), card("b", 1, "sideboard")], []);

    expect(diff.addCount).toBe(0);
    expect(diff.cutCount).toBe(4);
    expect(diff.sharedCount).toBe(0);
    expect(diff.zones[0].entries[0].kind).toBe("cut");
  });

  it("splits a partial overlap into shared, add, and cut copies", () => {
    const ours = [card("up", 1), card("down", 3), card("gone", 2)];
    const theirs = [card("up", 3), card("down", 1), card("new", 4)];

    const diff = diffDecks(ours, theirs);

    expect(diff.sharedCount).toBe(1 + 1);
    expect(diff.addCount).toBe(2 + 4);
    expect(diff.cutCount).toBe(2 + 2);
  });

  it("returns an empty diff for two empty decks", () => {
    const diff = diffDecks([], []);

    expect(diff).toEqual({ zones: [], sharedCount: 0, addCount: 0, cutCount: 0 });
  });

  it("keeps our card name when both sides name the card differently", () => {
    const ours = [card("a", 1, "main", "Our Name")];
    const theirs = [card("a", 2, "main", "Their Name")];

    const diff = diffDecks(ours, theirs);

    expect(diff.zones[0].entries[0].cardName).toBe("Our Name");
  });
});

describe("deckDiffCardsFrom", () => {
  it("names each card from the catalog", () => {
    const result = deckDiffCardsFrom(
      [deckCard("a", 2), deckCard("b", 1, "sideboard")],
      catalog({ a: "Ashe", b: "Braum" }),
    );

    expect(result).toEqual([
      { cardId: "a", cardName: "Ashe", zone: "main", quantity: 2 },
      { cardId: "b", cardName: "Braum", zone: "sideboard", quantity: 1 },
    ]);
  });

  it("drops card ids the catalog doesn't know", () => {
    const result = deckDiffCardsFrom(
      [deckCard("a", 2), deckCard("missing", 3)],
      catalog({ a: "Ashe" }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].cardId).toBe("a");
  });

  it("keeps one row per printing so split quantities survive", () => {
    const result = deckDiffCardsFrom([deckCard("a", 1), deckCard("a", 2)], catalog({ a: "Ashe" }));

    expect(result.map((entry) => entry.quantity)).toEqual([1, 2]);
  });

  it("returns nothing for an empty deck", () => {
    expect(deckDiffCardsFrom([], catalog({ a: "Ashe" }))).toEqual([]);
  });

  it("returns nothing when the catalog is empty", () => {
    expect(deckDiffCardsFrom([deckCard("a", 2)], {})).toEqual([]);
  });
});
