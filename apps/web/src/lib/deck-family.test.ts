import { describe, expect, it } from "vitest";

import { collapseFamilies } from "./deck-family";

interface TestItem {
  deck: { id: string; familyId: string | null; isPrimary: boolean };
}

function makeItem(id: string, familyId: string | null = null, isPrimary = false): TestItem {
  return { deck: { id, familyId, isPrimary } };
}

/**
 * Ids in render order, with a "+" marking the entries that carry family info.
 * @returns One label per rendered entry.
 */
function render(entries: ReturnType<typeof collapseFamilies<TestItem>>): string[] {
  return entries.map((entry) => (entry.family ? `${entry.item.deck.id}+` : entry.item.deck.id));
}

describe("collapseFamilies", () => {
  it("returns nothing for an empty list", () => {
    expect(collapseFamilies<TestItem>([], new Set())).toEqual([]);
  });

  it("passes standalone decks through untouched", () => {
    const items = [makeItem("a"), makeItem("b")];
    const entries = collapseFamilies(items, new Set());
    expect(entries).toEqual([{ item: items[0] }, { item: items[1] }]);
  });

  it("fronts a collapsed family with its primary, at the primary's own position", () => {
    const items = [
      makeItem("budget", "fam"),
      makeItem("solo"),
      makeItem("main", "fam", true),
      makeItem("tourney", "fam"),
    ];
    const entries = collapseFamilies(items, new Set());
    expect(render(entries)).toEqual(["solo", "main+"]);
    expect(entries[1]?.family).toEqual({
      id: "fam",
      memberCount: 3,
      expanded: false,
      role: "front",
    });
  });

  it("reveals the remaining members in list order when expanded", () => {
    const items = [
      makeItem("budget", "fam"),
      makeItem("main", "fam", true),
      makeItem("tourney", "fam"),
      makeItem("solo"),
    ];
    const entries = collapseFamilies(items, new Set(["fam"]));
    expect(render(entries)).toEqual(["main+", "budget+", "tourney+", "solo"]);
    expect(entries.map((entry) => entry.family?.role)).toEqual([
      "front",
      "member",
      "member",
      undefined,
    ]);
    expect(entries[1]?.family?.expanded).toBe(true);
  });

  it("falls back to the first member when the primary is not in the list", () => {
    const items = [makeItem("budget", "fam"), makeItem("tourney", "fam")];
    const entries = collapseFamilies(items, new Set(["fam"]));
    expect(render(entries)).toEqual(["budget+", "tourney+"]);
    expect(entries[0]?.family?.memberCount).toBe(2);
  });

  it("counts only the members present in this list", () => {
    // Grouping splits a family across buckets, so each bucket sees a slice.
    const entries = collapseFamilies([makeItem("main", "fam", true)], new Set());
    expect(entries[0]?.family).toEqual({
      id: "fam",
      memberCount: 1,
      expanded: false,
      role: "front",
    });
  });

  it("keeps several families independent", () => {
    const items = [
      makeItem("a1", "one", true),
      makeItem("a2", "one"),
      makeItem("b1", "two", true),
      makeItem("b2", "two"),
    ];
    expect(render(collapseFamilies(items, new Set(["two"])))).toEqual(["a1+", "b1+", "b2+"]);
  });

  it("ignores an expanded id that no longer matches a family", () => {
    const items = [makeItem("solo"), makeItem("main", "fam", true)];
    expect(render(collapseFamilies(items, new Set(["gone"])))).toEqual(["solo", "main+"]);
  });
});
