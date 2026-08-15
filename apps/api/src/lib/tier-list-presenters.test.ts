import { describe, expect, it } from "vitest";

import type { TierList } from "../repositories/tier-lists.js";
import { toPublicTierList, toTierList, toTierListSummary } from "./tier-list-presenters.js";

const CARD = (n: number): string => `c0000000-0000-4000-a000-00000000000${n}`;
const PRINTING = (n: number): string => `d0000000-0000-4000-a000-00000000000${n}`;

/** @returns Entries for `cardIds`, all following the default printing. */
const entries = (cardIds: string[]) => cardIds.map((cardId) => ({ cardId, printingId: null }));

function makeRow(overrides: Partial<TierList> = {}): TierList {
  return {
    id: "70000000-0001-4000-a000-000000000001",
    userId: "a0000000-0001-4000-a000-000000000001",
    title: "Origins — best commons",
    description: "Limited only.",
    tiers: [
      { label: "S", cards: entries([CARD(1), CARD(2)]) },
      { label: "A", cards: [{ cardId: CARD(3), printingId: PRINTING(3) }] },
      { label: "B", cards: [] },
    ],
    isPublic: true,
    shareToken: "AbCdEfGhIjKl",
    createdAt: new Date("2026-08-01T10:30:00.000Z"),
    updatedAt: new Date("2026-08-02T11:00:00.000Z"),
    ...overrides,
  };
}

describe("toTierList", () => {
  it("maps a row to the owner response shape", () => {
    expect(toTierList(makeRow())).toEqual({
      id: "70000000-0001-4000-a000-000000000001",
      title: "Origins — best commons",
      description: "Limited only.",
      tiers: [
        { label: "S", cards: entries([CARD(1), CARD(2)]) },
        { label: "A", cards: [{ cardId: CARD(3), printingId: PRINTING(3) }] },
        { label: "B", cards: [] },
      ],
      isPublic: true,
      shareToken: "AbCdEfGhIjKl",
      createdAt: "2026-08-01T10:30:00.000Z",
      updatedAt: "2026-08-02T11:00:00.000Z",
    });
  });

  it("does not leak userId into the response", () => {
    expect(toTierList(makeRow())).not.toHaveProperty("userId");
  });

  it("copies card arrays rather than aliasing the row's", () => {
    const row = makeRow();
    const response = toTierList(row);
    response.tiers[0]?.cards.push({ cardId: CARD(9), printingId: null });
    expect(row.tiers[0]?.cards).toHaveLength(2);
  });

  it("carries each entry's pinned printing through", () => {
    expect(toTierList(makeRow()).tiers[1]?.cards).toEqual([
      { cardId: CARD(3), printingId: PRINTING(3) },
    ]);
  });

  it("carries an empty board through as an empty tier array", () => {
    expect(toTierList(makeRow({ tiers: [] })).tiers).toEqual([]);
  });

  it("keeps a null description null", () => {
    expect(toTierList(makeRow({ description: null })).description).toBeNull();
  });
});

describe("toTierListSummary", () => {
  it("counts rows and ranked cards", () => {
    const summary = toTierListSummary(makeRow());
    expect(summary.tierCount).toBe(3);
    expect(summary.cardCount).toBe(3);
  });

  it("previews every row that holds cards, in board order", () => {
    expect(toTierListSummary(makeRow()).previewRows).toEqual([
      { rowIndex: 0, label: "S", cards: entries([CARD(1), CARD(2)]) },
      { rowIndex: 1, label: "A", cards: [{ cardId: CARD(3), printingId: PRINTING(3) }] },
    ]);
  });

  it("skips an empty row but keeps the board position of the ones it sends", () => {
    // The tier colour is derived from the board index, so a preview that
    // renumbered its rows would paint A in S's colour.
    const summary = toTierListSummary(
      makeRow({
        tiers: [
          { label: "S", cards: [] },
          { label: "A", cards: entries([CARD(4), CARD(5)]) },
        ],
      }),
    );
    expect(summary.previewRows).toEqual([
      { rowIndex: 1, label: "A", cards: entries([CARD(4), CARD(5)]) },
    ]);
  });

  it("marks the unranked row, and only that row", () => {
    const summary = toTierListSummary(
      makeRow({
        tiers: [
          { label: "S", cards: entries([CARD(1)]) },
          { label: "Cut", cards: entries([CARD(2)]), unranked: true },
        ],
      }),
    );
    expect(summary.previewRows[0]).not.toHaveProperty("unranked");
    expect(summary.previewRows[1]?.unranked).toBe(true);
  });

  it("caps the preview at four rows", () => {
    const summary = toTierListSummary(
      makeRow({
        tiers: Array.from({ length: 7 }, (_, index) => ({
          label: `T${index}`,
          cards: entries([CARD(index)]),
        })),
      }),
    );
    expect(summary.previewRows).toHaveLength(4);
    expect(summary.previewRows.at(-1)?.label).toBe("T3");
  });

  it("caps each previewed row at fourteen cards", () => {
    const many = Array.from({ length: 20 }, (_, index) => CARD(index));
    const summary = toTierListSummary(makeRow({ tiers: [{ label: "S", cards: entries(many) }] }));
    expect(summary.previewRows[0]?.cards).toEqual(entries(many.slice(0, 14)));
    expect(summary.cardCount).toBe(20);
  });

  it("previews nothing when no row holds a card", () => {
    const summary = toTierListSummary(
      makeRow({
        tiers: [
          { label: "S", cards: [] },
          { label: "A", cards: [] },
        ],
      }),
    );
    expect(summary.previewRows).toEqual([]);
    expect(summary.cardCount).toBe(0);
    expect(summary.tierCount).toBe(2);
  });

  it("reports zero for a list with no rows at all", () => {
    const summary = toTierListSummary(makeRow({ tiers: [] }));
    expect(summary).toMatchObject({ tierCount: 0, cardCount: 0, previewRows: [] });
  });

  it("does not ship the full board", () => {
    expect(toTierListSummary(makeRow())).not.toHaveProperty("tiers");
  });
});

describe("toPublicTierList", () => {
  it("maps a row to the anonymous share shape", () => {
    expect(toPublicTierList(makeRow())).toEqual({
      id: "70000000-0001-4000-a000-000000000001",
      title: "Origins — best commons",
      description: "Limited only.",
      tiers: [
        { label: "S", cards: entries([CARD(1), CARD(2)]) },
        { label: "A", cards: [{ cardId: CARD(3), printingId: PRINTING(3) }] },
        { label: "B", cards: [] },
      ],
      createdAt: "2026-08-01T10:30:00.000Z",
      updatedAt: "2026-08-02T11:00:00.000Z",
    });
  });

  it("withholds the owner-only fields", () => {
    const response = toPublicTierList(makeRow());
    expect(response).not.toHaveProperty("shareToken");
    expect(response).not.toHaveProperty("isPublic");
    expect(response).not.toHaveProperty("userId");
  });
});
