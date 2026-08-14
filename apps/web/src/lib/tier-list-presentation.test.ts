import { describe, expect, it } from "vitest";

import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
import { stubCard, stubPrinting } from "@/test/factories";

import type { ResolvedTierRow } from "./tier-list-presentation";
import { revealedRows, tierRowsToQueue } from "./tier-list-presentation";

function view(cardId: string, withPrinting = true): TierCardView {
  return {
    cardId,
    card: stubCard({ name: cardId }),
    printing: withPrinting ? stubPrinting({ id: `p-${cardId}`, cardId }) : undefined,
    pinnedPrintingId: null,
  };
}

function board(...rows: [label: string, ...cardIds: string[]][]): ResolvedTierRow[] {
  return rows.map(([label, ...cardIds]) => ({ label, cards: cardIds.map((id) => view(id)) }));
}

describe("tierRowsToQueue", () => {
  it("walks the board top row down by default", () => {
    const rows = board(["S", "a", "b"], ["A", "c"]);

    const queue = tierRowsToQueue(rows);

    expect(queue.map((stop) => stop.printing.id)).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("carries the tier label as the corner marker's context", () => {
    const rows = board(["S", "a"], ["A", "c"]);

    const queue = tierRowsToQueue(rows);

    expect(queue.map((stop) => stop.contextLabel)).toEqual(["S", "A"]);
  });

  it("walks the bottom row first when the run climbs", () => {
    const rows = board(["S", "a"], ["A", "b"], ["B", "c"]);

    const queue = tierRowsToQueue(rows, "worst-first");

    expect(queue.map((stop) => stop.printing.id)).toEqual(["p-c", "p-b", "p-a"]);
  });

  it("keeps board coordinates when the run climbs, so cards still place by rank", () => {
    const rows = board(["S", "a"], ["A", "b"]);

    const queue = tierRowsToQueue(rows, "worst-first");

    expect(queue.map((stop) => stop.rowIndex)).toEqual([1, 0]);
  });

  it("drops entries with no printing to draw rather than staging a blank", () => {
    const rows: ResolvedTierRow[] = [{ label: "S", cards: [view("a"), view("b", false)] }];

    const queue = tierRowsToQueue(rows);

    expect(queue.map((stop) => stop.printing.id)).toEqual(["p-a"]);
  });

  it("gives every stop a distinct id", () => {
    const rows = board(["S", "a", "b"], ["A", "c"]);

    const queue = tierRowsToQueue(rows);

    expect(new Set(queue.map((stop) => stop.id)).size).toBe(3);
  });

  it("returns nothing for an empty board", () => {
    expect(tierRowsToQueue([])).toEqual([]);
    expect(tierRowsToQueue(board(["S"], ["A"]))).toEqual([]);
  });
});

describe("revealedRows", () => {
  it("holds back the card at the current index — it is still on the stage", () => {
    const rows = board(["S", "a", "b"], ["A", "c"]);
    const queue = tierRowsToQueue(rows);

    const revealed = revealedRows(rows, queue, 1);

    expect(revealed.map((row) => row.cards.map((card) => card.cardId))).toEqual([["a"], []]);
  });

  it("starts with every tier empty", () => {
    const rows = board(["S", "a"], ["A", "b"]);

    const revealed = revealedRows(rows, tierRowsToQueue(rows), 0);

    expect(revealed.map((row) => row.cards)).toEqual([[], []]);
  });

  it("ends with the whole board", () => {
    const rows = board(["S", "a", "b"], ["A", "c"]);
    const queue = tierRowsToQueue(rows);

    const revealed = revealedRows(rows, queue, queue.length);

    expect(revealed.map((row) => row.cards.map((card) => card.cardId))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("places a climbing run's cards in their own tiers, bottom up", () => {
    const rows = board(["S", "a"], ["A", "b"], ["B", "c"]);
    const queue = tierRowsToQueue(rows, "worst-first");

    const revealed = revealedRows(rows, queue, 2);

    expect(revealed.map((row) => row.cards.map((card) => card.cardId))).toEqual([[], ["b"], ["c"]]);
  });

  it("keeps every tier on the ladder, including ones the run hasn't reached", () => {
    const rows = board(["S", "a"], ["A", "b"], ["B"]);

    const revealed = revealedRows(rows, tierRowsToQueue(rows), 1);

    expect(revealed.map((row) => row.label)).toEqual(["S", "A", "B"]);
  });

  it("treats a negative count as nothing placed", () => {
    const rows = board(["S", "a"]);

    const revealed = revealedRows(rows, tierRowsToQueue(rows), -3);

    expect(revealed[0]?.cards).toEqual([]);
  });

  it("keeps cards in board order rather than reveal order", () => {
    const rows = board(["S", "a", "b", "c"]);
    // A climbing run still reads each row left to right, so revealing two from
    // this single row must not reorder what is already on the board.
    const queue = tierRowsToQueue(rows, "worst-first");

    const revealed = revealedRows(rows, queue, 2);

    expect(revealed[0]?.cards.map((card) => card.cardId)).toEqual(["a", "b"]);
  });
});
