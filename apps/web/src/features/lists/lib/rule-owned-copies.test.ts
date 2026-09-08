import type { Printing } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import { stubCopy, stubPrinting } from "@/test/factories";

import { ownedCopiesFromCopyList, ownedCopiesFromCounts } from "./rule-owned-copies";

describe("ownedCopiesFromCounts", () => {
  it("returns nothing without counts", () => {
    expect(ownedCopiesFromCounts(undefined, {})).toEqual([]);
  });

  it("expands a count into that many rows for the printing", () => {
    const printing = stubPrinting();
    const printingsById: Record<string, Printing> = { [printing.id]: printing };
    const rows = ownedCopiesFromCounts({ [printing.id]: 3 }, printingsById);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.printingId === printing.id)).toBe(true);
    expect(new Set(rows.map((row) => row.copyId)).size).toBe(3);
  });

  it("skips a printing id no longer in the catalog", () => {
    const rows = ownedCopiesFromCounts({ "missing-printing": 2 }, {});
    expect(rows).toEqual([]);
  });
});

describe("ownedCopiesFromCopyList", () => {
  it("keeps a copy owned personally", () => {
    const printing = stubPrinting();
    const copy = stubCopy({ printingId: printing.id, groupId: null });
    const printingsById: Record<string, Printing> = { [printing.id]: printing };
    const rows = ownedCopiesFromCopyList([copy], printingsById);
    expect(rows).toEqual([
      {
        copyId: copy.id,
        printingId: printing.id,
        cardId: printing.cardId,
        collectionId: copy.collectionId,
        reserved: false,
      },
    ]);
  });

  it("drops a group-shared copy", () => {
    const printing = stubPrinting();
    const copy = stubCopy({ printingId: printing.id, groupId: "group-1" });
    const printingsById: Record<string, Printing> = { [printing.id]: printing };
    expect(ownedCopiesFromCopyList([copy], printingsById)).toEqual([]);
  });

  it("skips a copy whose printing no longer exists", () => {
    const copy = stubCopy({ printingId: "missing-printing", groupId: null });
    expect(ownedCopiesFromCopyList([copy], {})).toEqual([]);
  });
});
