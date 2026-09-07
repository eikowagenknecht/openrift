import type { OverlayBoard } from "@openrift/shared/contracts/overlay";
import type { Card, Printing } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import { stubCard, stubPrinting } from "@/test/factories";

import { deriveOverlayBoardScene } from "./overlay-board-scene";

const CARD_IDS = ["a", "b", "c", "d"];

const cardsById: Record<string, Card> = Object.fromEntries(
  CARD_IDS.map((id) => [id, stubCard({ name: id.toUpperCase() })]),
);

const printingsByCardId = new Map<string, Printing[]>(
  CARD_IDS.map((id) => [id, [stubPrinting({ id: `p-${id}`, cardId: id })]]),
);

function board(overrides: Partial<OverlayBoard> = {}): OverlayBoard {
  return {
    title: "Origins, ranked",
    tiers: [
      { label: "S", cards: [entry("a"), entry("b")] },
      { label: "A", cards: [entry("c"), entry("d")] },
    ],
    revealCount: 0,
    direction: "best-first",
    ...overrides,
  };
}

function entry(cardId: string) {
  return { cardId, printingId: null };
}

function placed(rows: { cards: { cardId: string }[] }[]): string[][] {
  return rows.map((row) => row.cards.map((view) => view.cardId));
}

describe("deriveOverlayBoardScene", () => {
  it("shows only what the run has placed, and rings the last one down", () => {
    const scene = deriveOverlayBoardScene(board({ revealCount: 3 }), cardsById, printingsByCardId);

    expect(placed(scene.rows)).toEqual([["a", "b"], ["c"]]);
    expect(scene.focusCardId).toBe("c");
    expect(scene.total).toBe(4);
  });

  it("draws an empty ladder before the run starts, with nothing spotlit", () => {
    const scene = deriveOverlayBoardScene(board(), cardsById, printingsByCardId);

    expect(placed(scene.rows)).toEqual([[], []]);
    expect(scene.focusCardId).toBeNull();
  });

  it("drops the spotlight once every card is down", () => {
    const scene = deriveOverlayBoardScene(board({ revealCount: 4 }), cardsById, printingsByCardId);

    expect(placed(scene.rows)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(scene.focusCardId).toBeNull();
  });

  it("treats a count past the last card as a finished reveal", () => {
    const scene = deriveOverlayBoardScene(board({ revealCount: 99 }), cardsById, printingsByCardId);

    expect(placed(scene.rows)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(scene.focusCardId).toBeNull();
  });

  it("places the bottom tier first when the run climbs", () => {
    const scene = deriveOverlayBoardScene(
      board({ revealCount: 2, direction: "worst-first" }),
      cardsById,
      printingsByCardId,
    );

    expect(placed(scene.rows)).toEqual([[], ["c", "d"]]);
    expect(scene.focusCardId).toBe("d");
  });

  it("skips a card the catalogue no longer has, steps and all", () => {
    const tiers = [{ label: "S", cards: [entry("a"), entry("gone"), entry("b")] }];

    const midway = deriveOverlayBoardScene(
      board({ revealCount: 1, tiers }),
      cardsById,
      printingsByCardId,
    );
    const done = deriveOverlayBoardScene(
      board({ revealCount: 2, tiers }),
      cardsById,
      printingsByCardId,
    );

    expect(placed(midway.rows)).toEqual([["a"]]);
    expect(midway.focusCardId).toBe("a");
    expect(placed(done.rows)).toEqual([["a", "b"]]);
    expect(done.total).toBe(2);
  });

  it("reports a board with nothing rankable as already finished", () => {
    const scene = deriveOverlayBoardScene(
      board({ tiers: [{ label: "S", cards: [entry("gone")] }] }),
      cardsById,
      printingsByCardId,
    );

    expect(scene.total).toBe(0);
    expect(scene.focusCardId).toBeNull();
    expect(placed(scene.rows)).toEqual([[]]);
  });
});
