import type { DeckZone } from "@openrift/shared/types/enums";
import { describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import type { PlanSwapDraft } from "@/lib/deck-plan";
import { applySwaps, hasActiveSwaps } from "@/lib/deck-swap-test";
import { stubDeckBuilderCard } from "@/test/factories";

const main = (cardId: string, quantity: number, cardName = cardId): DeckBuilderCard =>
  stubDeckBuilderCard({ cardId, cardName, quantity, zone: "main" as DeckZone });

const side = (cardId: string, quantity: number, cardName = cardId): DeckBuilderCard =>
  stubDeckBuilderCard({ cardId, cardName, quantity, zone: "sideboard" as DeckZone });

const bringIn = (cardId: string, quantity: number): PlanSwapDraft => ({
  cardId,
  direction: "in",
  quantity,
});

const takeOut = (cardId: string, quantity: number): PlanSwapDraft => ({
  cardId,
  direction: "out",
  quantity,
});

const entry = (cards: readonly DeckBuilderCard[], cardId: string, zone: string) =>
  cards.find((card) => card.cardId === cardId && card.zone === zone);

describe("hasActiveSwaps", () => {
  it("is false for no swaps and for all-zero quantities", () => {
    expect(hasActiveSwaps([])).toBe(false);
    expect(hasActiveSwaps([bringIn("a", 0), takeOut("b", 0)])).toBe(false);
  });

  it("is true when any entry moves a copy", () => {
    expect(hasActiveSwaps([bringIn("a", 1)])).toBe(true);
    expect(hasActiveSwaps([takeOut("b", 2)])).toBe(true);
    expect(hasActiveSwaps([bringIn("a", 0), takeOut("b", 1)])).toBe(true);
  });
});

describe("applySwaps", () => {
  it("moves sideboard copies into a new main entry", () => {
    const cards = [main("keep", 3), side("tech", 2)];
    const result = applySwaps(cards, [bringIn("tech", 2)]);

    expect(entry(result, "tech", "sideboard")).toBeUndefined();
    expect(entry(result, "tech", "main")).toMatchObject({ quantity: 2, zone: "main" });
    expect(entry(result, "keep", "main")?.quantity).toBe(3);
  });

  it("merges swapped-in copies into an existing main entry", () => {
    const cards = [main("flex", 1), side("flex", 2)];
    const result = applySwaps(cards, [bringIn("flex", 1)]);

    expect(entry(result, "flex", "main")?.quantity).toBe(2);
    expect(entry(result, "flex", "sideboard")?.quantity).toBe(1);
    expect(result.filter((card) => card.cardId === "flex" && card.zone === "main")).toHaveLength(1);
  });

  it("drops the sideboard entry once its last copy is brought in", () => {
    const cards = [main("flex", 1), side("flex", 3)];
    const result = applySwaps(cards, [bringIn("flex", 3)]);

    expect(entry(result, "flex", "sideboard")).toBeUndefined();
    expect(entry(result, "flex", "main")?.quantity).toBe(4);
  });

  it("reduces a main entry on a cut and drops it at exactly zero", () => {
    const cards = [main("cut", 3), main("stay", 2)];
    const result = applySwaps(cards, [takeOut("cut", 1)]);
    expect(entry(result, "cut", "main")?.quantity).toBe(2);

    const emptied = applySwaps(cards, [takeOut("cut", 3)]);
    expect(entry(emptied, "cut", "main")).toBeUndefined();
    expect(emptied).toHaveLength(1);
    expect(entry(emptied, "stay", "main")?.quantity).toBe(2);
  });

  it("does not return cut copies to the sideboard", () => {
    const cards = [main("cut", 2)];
    const result = applySwaps(cards, [takeOut("cut", 2)]);

    expect(result).toHaveLength(0);
  });

  it("clamps a bring-in to the copies actually in the sideboard", () => {
    const cards = [side("tech", 2)];
    const result = applySwaps(cards, [bringIn("tech", 9)]);

    expect(entry(result, "tech", "sideboard")).toBeUndefined();
    expect(entry(result, "tech", "main")?.quantity).toBe(2);
  });

  it("clamps a cut to the copies actually in the main deck", () => {
    const cards = [main("cut", 2), side("tech", 1)];
    const result = applySwaps(cards, [takeOut("cut", 9)]);

    expect(entry(result, "cut", "main")).toBeUndefined();
    expect(entry(result, "tech", "sideboard")?.quantity).toBe(1);
  });

  it("ignores cards that are not in the relevant zone", () => {
    const cards = [main("only-main", 2), side("only-side", 1)];
    const result = applySwaps(cards, [bringIn("only-main", 2), takeOut("only-side", 1)]);

    expect(result).toHaveLength(2);
    expect(entry(result, "only-main", "main")?.quantity).toBe(2);
    expect(entry(result, "only-side", "sideboard")?.quantity).toBe(1);
    expect(entry(result, "only-main", "sideboard")).toBeUndefined();
  });

  it("passes other zones through untouched", () => {
    const legend = stubDeckBuilderCard({
      cardId: "legend",
      quantity: 1,
      zone: "legend" as DeckZone,
    });
    const rune = stubDeckBuilderCard({ cardId: "rune", quantity: 12, zone: "runes" as DeckZone });
    const battlefield = stubDeckBuilderCard({
      cardId: "battlefield",
      quantity: 3,
      zone: "battlefield" as DeckZone,
    });
    const cards = [legend, rune, battlefield, main("cut", 2), side("tech", 2)];
    const result = applySwaps(cards, [bringIn("tech", 1), takeOut("cut", 1)]);

    expect(result).toContain(legend);
    expect(result).toContain(rune);
    expect(result).toContain(battlefield);
  });

  it("returns an equivalent deck for no swaps and for zero quantities", () => {
    const cards = [main("keep", 3), side("tech", 2)];

    expect(applySwaps(cards, [])).toEqual(cards);
    expect(applySwaps(cards, [bringIn("tech", 0), takeOut("keep", 0)])).toEqual(cards);
  });

  it("mutates neither the input array nor its card objects", () => {
    const cards = [main("keep", 3), side("tech", 2)];
    const snapshot = structuredClone(cards);

    applySwaps(cards, [bringIn("tech", 2), takeOut("keep", 1)]);

    expect(cards).toEqual(snapshot);
  });

  it("drains copies split across pinned printings", () => {
    const cards = [
      { ...side("tech", 1), preferredPrintingId: "print-a" },
      { ...side("tech", 2), preferredPrintingId: "print-b" },
    ];
    const result = applySwaps(cards, [bringIn("tech", 3)]);

    expect(result.filter((card) => card.zone === "sideboard")).toHaveLength(0);
    expect(entry(result, "tech", "main")).toMatchObject({
      quantity: 3,
      preferredPrintingId: "print-a",
    });
  });

  it("cuts across several main entries of the same card", () => {
    const cards = [
      { ...main("cut", 2), preferredPrintingId: "print-a" },
      { ...main("cut", 1), preferredPrintingId: "print-b" },
    ];
    const result = applySwaps(cards, [takeOut("cut", 3)]);

    expect(result).toHaveLength(0);
  });

  it("applies every bring-in before any cut, whatever the array order", () => {
    const cards = [main("flex", 1), side("flex", 2)];
    const result = applySwaps(cards, [takeOut("flex", 1), bringIn("flex", 2)]);

    expect(entry(result, "flex", "main")?.quantity).toBe(2);
    expect(entry(result, "flex", "sideboard")).toBeUndefined();
  });

  it("accumulates duplicate entries for the same card and direction", () => {
    const cards = [side("tech", 3)];
    const result = applySwaps(cards, [bringIn("tech", 1), bringIn("tech", 2)]);

    expect(entry(result, "tech", "main")?.quantity).toBe(3);
    expect(entry(result, "tech", "sideboard")).toBeUndefined();
  });
});
