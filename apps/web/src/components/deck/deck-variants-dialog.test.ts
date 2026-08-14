import type { DeckSummaryResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { defaultCompareId, linkableDeckOptions } from "@/components/deck/deck-variants-dialog";

function stubMember(overrides: Partial<DeckSummaryResponse> & { id: string }): DeckSummaryResponse {
  return {
    name: `Deck ${overrides.id}`,
    descriptionSnippet: null,
    format: WellKnown.deckFormat.CONSTRUCTED,
    formatConfig: null,
    isPinned: false,
    archivedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    coverCardId: null,
    coverPrintingId: null,
    coverPosition: null,
    collectionId: null,
    familyId: "family-1",
    predecessorDeckId: null,
    isPrimary: false,
    isDraft: false,
    ...overrides,
  };
}

describe("defaultCompareId", () => {
  it("starts on the deck's own predecessor", () => {
    const members = [
      stubMember({ id: "live", predecessorDeckId: "checkpoint" }),
      stubMember({ id: "checkpoint" }),
      stubMember({ id: "budget" }),
    ];
    expect(defaultCompareId("live", members)).toBe("checkpoint");
  });

  it("falls back to another member when the predecessor left the family", () => {
    const members = [
      stubMember({ id: "live", predecessorDeckId: "deleted" }),
      stubMember({ id: "budget" }),
    ];
    expect(defaultCompareId("live", members)).toBe("budget");
  });

  it("falls back to another member when there is no predecessor", () => {
    const members = [stubMember({ id: "live" }), stubMember({ id: "budget" })];
    expect(defaultCompareId("live", members)).toBe("budget");
  });

  it("returns the deck itself when it is the only member", () => {
    expect(defaultCompareId("live", [stubMember({ id: "live" })])).toBe("live");
  });

  it("returns the deck itself when it is not in the list at all", () => {
    expect(defaultCompareId("live", [])).toBe("live");
  });
});

describe("linkableDeckOptions", () => {
  it("lists every other deck by name", () => {
    const decks = [
      stubMember({ id: "zed", name: "Zed pile" }),
      stubMember({ id: "ashe", name: "Ashe ramp" }),
      stubMember({ id: "live" }),
    ];
    expect(linkableDeckOptions(decks, new Set(["live"]))).toEqual([
      { value: "ashe", label: "Ashe ramp" },
      { value: "zed", label: "Zed pile" },
    ]);
  });

  it("drops the decks already in the family", () => {
    const decks = [
      stubMember({ id: "live" }),
      stubMember({ id: "budget" }),
      stubMember({ id: "outsider" }),
    ];
    expect(linkableDeckOptions(decks, new Set(["live", "budget"]))).toEqual([
      { value: "outsider", label: "Deck outsider" },
    ]);
  });

  it("drops archived decks", () => {
    const decks = [
      stubMember({ id: "archived", archivedAt: "2026-08-01T00:00:00.000Z" }),
      stubMember({ id: "active" }),
    ];
    expect(linkableDeckOptions(decks, new Set<string>())).toEqual([
      { value: "active", label: "Deck active" },
    ]);
  });

  it("returns nothing when the family is all there is", () => {
    expect(linkableDeckOptions([stubMember({ id: "live" })], new Set(["live"]))).toEqual([]);
    expect(linkableDeckOptions([], new Set(["live"]))).toEqual([]);
  });
});
