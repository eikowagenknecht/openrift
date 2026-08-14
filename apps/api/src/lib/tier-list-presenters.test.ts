import { describe, expect, it } from "vitest";

import type { TierList } from "../repositories/tier-lists.js";
import { toPublicTierList, toTierList, toTierListSummary } from "./tier-list-presenters.js";

const CARD = (n: number): string => `c0000000-0000-4000-a000-00000000000${n}`;

function makeRow(overrides: Partial<TierList> = {}): TierList {
  return {
    id: "70000000-0001-4000-a000-000000000001",
    userId: "a0000000-0001-4000-a000-000000000001",
    title: "Origins — best commons",
    description: "Limited only.",
    setId: "50000000-0001-4000-a000-000000000001",
    tiers: [
      { label: "S", cardIds: [CARD(1), CARD(2)] },
      { label: "A", cardIds: [CARD(3)] },
      { label: "B", cardIds: [] },
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
      setId: "50000000-0001-4000-a000-000000000001",
      tiers: [
        { label: "S", cardIds: [CARD(1), CARD(2)] },
        { label: "A", cardIds: [CARD(3)] },
        { label: "B", cardIds: [] },
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
    response.tiers[0]?.cardIds.push(CARD(9));
    expect(row.tiers[0]?.cardIds).toHaveLength(2);
  });

  it("carries an empty board through as an empty tier array", () => {
    expect(toTierList(makeRow({ tiers: [] })).tiers).toEqual([]);
  });

  it("keeps a null description and set scope null", () => {
    const response = toTierList(makeRow({ description: null, setId: null }));
    expect(response.description).toBeNull();
    expect(response.setId).toBeNull();
  });
});

describe("toTierListSummary", () => {
  it("counts rows and ranked cards", () => {
    const summary = toTierListSummary(makeRow());
    expect(summary.tierCount).toBe(3);
    expect(summary.cardCount).toBe(3);
  });

  it("previews the first row that actually holds cards", () => {
    const summary = toTierListSummary(
      makeRow({
        tiers: [
          { label: "S", cardIds: [] },
          { label: "A", cardIds: [CARD(4), CARD(5)] },
        ],
      }),
    );
    expect(summary.previewCardIds).toEqual([CARD(4), CARD(5)]);
  });

  it("caps the preview at six cards", () => {
    const many = Array.from({ length: 10 }, (_, index) => CARD(index));
    const summary = toTierListSummary(makeRow({ tiers: [{ label: "S", cardIds: many }] }));
    expect(summary.previewCardIds).toHaveLength(6);
    expect(summary.previewCardIds).toEqual(many.slice(0, 6));
  });

  it("previews nothing when no row holds a card", () => {
    const summary = toTierListSummary(
      makeRow({
        tiers: [
          { label: "S", cardIds: [] },
          { label: "A", cardIds: [] },
        ],
      }),
    );
    expect(summary.previewCardIds).toEqual([]);
    expect(summary.cardCount).toBe(0);
    expect(summary.tierCount).toBe(2);
  });

  it("reports zero for a list with no rows at all", () => {
    const summary = toTierListSummary(makeRow({ tiers: [] }));
    expect(summary).toMatchObject({ tierCount: 0, cardCount: 0, previewCardIds: [] });
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
      setId: "50000000-0001-4000-a000-000000000001",
      tiers: [
        { label: "S", cardIds: [CARD(1), CARD(2)] },
        { label: "A", cardIds: [CARD(3)] },
        { label: "B", cardIds: [] },
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
