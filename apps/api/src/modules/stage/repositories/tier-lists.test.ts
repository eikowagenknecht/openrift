import { describe, expect, it } from "vitest";

import { normalizeTiers } from "./tier-lists.js";

const CARD = (n: number): string => `c0000000-0000-4000-a000-00000000000${n}`;
const PRINTING = (n: number): string => `d0000000-0000-4000-a000-00000000000${n}`;

describe("normalizeTiers", () => {
  it("turns a legacy cardIds row into entries on the default printing", () => {
    expect(normalizeTiers([{ label: "S", cardIds: [CARD(1), CARD(2)] }])).toEqual([
      {
        label: "S",
        cards: [
          { cardId: CARD(1), printingId: null },
          { cardId: CARD(2), printingId: null },
        ],
      },
    ]);
  });

  it("keeps a current row's pinned printings", () => {
    expect(
      normalizeTiers([{ label: "A", cards: [{ cardId: CARD(3), printingId: PRINTING(3) }] }]),
    ).toEqual([{ label: "A", cards: [{ cardId: CARD(3), printingId: PRINTING(3) }] }]);
  });

  it("fills a missing printing with null rather than leaving the key off", () => {
    const [row] = normalizeTiers([
      { label: "S", cards: [{ cardId: CARD(1) } as { cardId: string; printingId: null }] },
    ]);
    expect(row?.cards[0]).toEqual({ cardId: CARD(1), printingId: null });
  });

  it("carries an empty legacy row through as an empty one", () => {
    expect(normalizeTiers([{ label: "B", cardIds: [] }])).toEqual([{ label: "B", cards: [] }]);
  });

  it("handles a legacy row with no card key at all", () => {
    expect(normalizeTiers([{ label: "C" }])).toEqual([{ label: "C", cards: [] }]);
  });

  it("normalizes a board that mixes both shapes", () => {
    expect(
      normalizeTiers([
        { label: "S", cards: [{ cardId: CARD(1), printingId: PRINTING(1) }] },
        { label: "A", cardIds: [CARD(2)] },
      ]),
    ).toEqual([
      { label: "S", cards: [{ cardId: CARD(1), printingId: PRINTING(1) }] },
      { label: "A", cards: [{ cardId: CARD(2), printingId: null }] },
    ]);
  });
});
