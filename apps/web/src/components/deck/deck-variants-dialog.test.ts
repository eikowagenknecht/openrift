import type { DeckSummaryResponse } from "@openrift/shared/types/api/deck";
import { WellKnown } from "@openrift/shared/well-known";
import { describe, expect, it } from "vitest";

import { linkableDeckOptions, parentOptions } from "@/components/deck/deck-variants-dialog";

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

describe("parentOptions", () => {
  it("offers every other member of the family", () => {
    const members = [
      stubMember({ id: "live", name: "Live" }),
      stubMember({ id: "budget", name: "Budget" }),
      stubMember({ id: "worlds", name: "Worlds" }),
    ];
    expect(parentOptions(members, "live")).toEqual([
      { value: "budget", label: "Budget" },
      { value: "worlds", label: "Worlds" },
    ]);
  });

  it("drops the deck's own descendants, however deep", () => {
    const members = [
      stubMember({ id: "root", name: "Root" }),
      stubMember({ id: "child", name: "Child", predecessorDeckId: "root" }),
      stubMember({ id: "grandchild", name: "Grandchild", predecessorDeckId: "child" }),
      stubMember({ id: "cousin", name: "Cousin" }),
    ];
    expect(parentOptions(members, "root")).toEqual([{ value: "cousin", label: "Cousin" }]);
  });

  it("finds descendants listed before their parent", () => {
    const members = [
      stubMember({ id: "grandchild", name: "Grandchild", predecessorDeckId: "child" }),
      stubMember({ id: "child", name: "Child", predecessorDeckId: "root" }),
      stubMember({ id: "root", name: "Root" }),
    ];
    expect(parentOptions(members, "root")).toEqual([]);
  });

  it("returns nothing for a lone member", () => {
    expect(parentOptions([stubMember({ id: "live" })], "live")).toEqual([]);
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
