import { describe, expect, it } from "vitest";

import type { MergeableListEntry } from "./list-entries.js";
import { mergeListEntriesByTarget } from "./list-entries.js";

describe("mergeListEntriesByTarget", () => {
  it("keys card-kind entries on cardId", () => {
    const entries: MergeableListEntry[] = [
      { kind: "card", cardId: "card-1", quantity: 1 },
      { kind: "card", cardId: "card-1", quantity: 2 },
      { kind: "card", cardId: "card-2", quantity: 1 },
    ];
    const merged = mergeListEntriesByTarget(entries);
    expect(merged).toEqual([
      { kind: "card", cardId: "card-1", quantity: 3 },
      { kind: "card", cardId: "card-2", quantity: 1 },
    ]);
  });

  it("keys printing- and copy-kind entries on printingId", () => {
    const entries: MergeableListEntry[] = [
      { kind: "printing", printingId: "printing-1", quantity: 1 },
      { kind: "copy", printingId: "printing-1", quantity: 1 },
    ];
    const merged = mergeListEntriesByTarget(entries);
    expect(merged).toEqual([{ kind: "printing", printingId: "printing-1", quantity: 2 }]);
  });

  it("sums quantities across every entry sharing a target", () => {
    const entries: MergeableListEntry[] = [
      { kind: "copy", printingId: "printing-1", quantity: 1 },
      { kind: "copy", printingId: "printing-1", quantity: 1 },
      { kind: "copy", printingId: "printing-1", quantity: 1 },
    ];
    expect(mergeListEntriesByTarget(entries)[0]?.quantity).toBe(3);
  });

  it("keeps the first-seen entry's other fields", () => {
    type DetailedEntry = MergeableListEntry & { cardName: string };
    const entries: DetailedEntry[] = [
      { kind: "card", cardId: "card-1", quantity: 1, cardName: "Ambessa" },
      { kind: "card", cardId: "card-1", quantity: 1, cardName: "stale duplicate" },
    ];
    const merged = mergeListEntriesByTarget(entries);
    expect(merged).toEqual([{ kind: "card", cardId: "card-1", quantity: 2, cardName: "Ambessa" }]);
  });

  it("returns an empty array for no entries", () => {
    expect(mergeListEntriesByTarget([])).toEqual([]);
  });
});
