import type { CardTradeLiveAnnotation, CardTradeLivePhase, CardTradeRole } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubCopy, stubPrinting } from "@/test/factories";

import {
  availableCopyCount,
  tileTradeStatus,
  tradeAnnotationByCopyId,
  tradeChipTitle,
} from "./tile-trade-status";

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: "p-1",
    role: "giver" as CardTradeRole,
    phase: "reserved" as CardTradeLivePhase,
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

describe("tradeChipTitle", () => {
  it("defers to the shared summary for a committed state", () => {
    expect(
      tradeChipTitle({
        annotation: annotation({ phase: "reserved", quantity: 2 }),
        availableCount: 0,
      }),
    ).toBe("Reserved (outgoing) · 2 copies");
  });

  it("keeps the shared summary's sibling breakdown when the totals diverge", () => {
    expect(
      tradeChipTitle({
        annotation: annotation({ phase: "reserved", quantity: 1 }),
        totalCount: 3,
        availableCount: 0,
      }),
    ).toBe("Reserved (outgoing) · 1 of this printing (3 across all printings)");
  });

  it("names the free copies alongside a giver-side asked count", () => {
    expect(
      tradeChipTitle({
        annotation: annotation({ phase: "asked", quantity: 3 }),
        availableCount: 1,
      }),
    ).toBe("Requested (outgoing) · 3 copies wanted, 1 available");
  });

  it("spells out that the asked number counts copies, not people", () => {
    const title = tradeChipTitle({
      annotation: annotation({ phase: "asked", quantity: 3, tradeCount: 2 }),
      availableCount: 1,
    });
    expect(title).toContain("copies wanted");
    expect(title).not.toContain("2");
  });

  it("says copy, not copies, for a single wanted one", () => {
    expect(
      tradeChipTitle({
        annotation: annotation({ phase: "asked", quantity: 1 }),
        availableCount: 2,
      }),
    ).toBe("Requested (outgoing) · 1 copy wanted, 2 available");
  });

  it("still says so when every copy of an asked printing is already pinned", () => {
    expect(
      tradeChipTitle({
        annotation: annotation({ phase: "asked", quantity: 2 }),
        availableCount: 0,
      }),
    ).toBe("Requested (outgoing) · 2 copies wanted, 0 available");
  });

  it("leaves a receiver-side asked annotation on the shared summary", () => {
    expect(
      tradeChipTitle({
        annotation: annotation({ role: "receiver", phase: "asked", quantity: 2 }),
        availableCount: 5,
      }),
    ).toBe("Requested (incoming) · 2 copies");
  });
});

describe("availableCopyCount", () => {
  it("counts the printing's unpinned copies only", () => {
    const copies = [
      stubCopy({ printingId: "p-1", reserved: true }),
      stubCopy({ printingId: "p-1", reserved: false }),
      stubCopy({ printingId: "p-1", reserved: false }),
      stubCopy({ printingId: "p-2", reserved: false }),
    ];
    expect(availableCopyCount(copies, "p-1")).toBe(2);
  });

  it("leaves out copies that are out on a loan", () => {
    const copies = [
      stubCopy({ printingId: "p-1", onLoan: true }),
      stubCopy({ printingId: "p-1", reserved: false, onLoan: false }),
    ];
    expect(availableCopyCount(copies, "p-1")).toBe(1);
  });

  it("counts a copy once when it is both loaned and reserved", () => {
    const copies = [stubCopy({ printingId: "p-1", reserved: true, onLoan: true })];
    expect(availableCopyCount(copies, "p-1")).toBe(0);
  });

  it("returns zero while the copy rows are still loading", () => {
    expect(availableCopyCount(undefined, "p-1")).toBe(0);
  });
});

describe("tileTradeStatus", () => {
  const base = {
    copies: [stubCopy({ printingId: "p-1" })],
    printingId: "p-1",
    siblingIds: ["p-1"],
    withSiblingTotal: false,
    isGroupCollection: false,
  };

  it("returns null when the printing has no live trade", () => {
    expect(
      tileTradeStatus({ ...base, annotations: [annotation({ printingId: "p-9" })] }),
    ).toBeNull();
  });

  it("returns null while the annotations are still loading", () => {
    expect(tileTradeStatus({ ...base, annotations: undefined })).toBeNull();
  });

  it("picks the most committed annotation on the printing", () => {
    const status = tileTradeStatus({
      ...base,
      annotations: [
        annotation({ phase: "asked", quantity: 4 }),
        annotation({ phase: "reserved", quantity: 1 }),
      ],
    });
    expect(status?.annotation.phase).toBe("reserved");
    expect(status?.annotation.quantity).toBe(1);
  });

  it("titles a giver-side asked tile with the copies still free", () => {
    const status = tileTradeStatus({
      ...base,
      copies: [
        stubCopy({ printingId: "p-1", reserved: true }),
        stubCopy({ printingId: "p-1", reserved: false }),
      ],
      annotations: [annotation({ phase: "asked", quantity: 3 })],
    });
    expect(status?.title).toBe("Requested (outgoing) · 3 copies wanted, 1 available");
  });

  it("reports nothing available when the only free copy is out on a loan", () => {
    const status = tileTradeStatus({
      ...base,
      copies: [
        stubCopy({ printingId: "p-1", reserved: true }),
        stubCopy({ printingId: "p-1", onLoan: true }),
      ],
      annotations: [annotation({ phase: "asked", quantity: 2 })],
    });
    expect(status?.title).toBe("Requested (outgoing) · 2 copies wanted, 0 available");
  });

  it("shows nothing on a group-collection tile, whichever side the trade is", () => {
    for (const role of ["giver", "receiver"] as const) {
      expect(
        tileTradeStatus({
          ...base,
          isGroupCollection: true,
          annotations: [annotation({ role, phase: "reserved" })],
        }),
      ).toBeNull();
    }
  });

  it("ignores sibling printings' trades in printings view", () => {
    const status = tileTradeStatus({
      ...base,
      annotations: [
        annotation({ phase: "reserved", quantity: 1 }),
        annotation({ printingId: "p-2", phase: "reserved", quantity: 4 }),
      ],
    });
    expect(status?.totalCount).toBeUndefined();
    expect(status?.title).toBe("Reserved (outgoing) · 1 copy");
  });

  it("sums the card-wide figure in cards view", () => {
    const status = tileTradeStatus({
      ...base,
      siblingIds: ["p-1", "p-2"],
      withSiblingTotal: true,
      annotations: [
        annotation({ phase: "reserved", quantity: 1 }),
        annotation({ printingId: "p-2", phase: "reserved", quantity: 2 }),
      ],
    });
    expect(status?.totalCount).toBe(3);
    expect(status?.title).toBe("Reserved (outgoing) · 1 of this printing (3 across all printings)");
  });

  it("keeps a sibling's weaker phase out of the card-wide figure", () => {
    const status = tileTradeStatus({
      ...base,
      siblingIds: ["p-1", "p-2"],
      withSiblingTotal: true,
      annotations: [
        annotation({ phase: "reserved", quantity: 1 }),
        annotation({ printingId: "p-2", phase: "asked", quantity: 5 }),
      ],
    });
    expect(status?.totalCount).toBe(1);
  });

  it("prefers the viewer's own copies when both sides are live on the printing", () => {
    const status = tileTradeStatus({
      ...base,
      annotations: [
        annotation({ role: "receiver", phase: "reserved" }),
        annotation({ role: "giver", phase: "asked" }),
      ],
    });
    expect(status?.annotation.role).toBe("giver");
  });
});

describe("tradeAnnotationByCopyId", () => {
  const printingOne = stubPrinting({ id: "p-1" });
  const printingTwo = stubPrinting({ id: "p-2" });

  it("gives every copy of a printing that printing's annotation", () => {
    const byCopy = tradeAnnotationByCopyId(
      [annotation({ printingId: "p-1", phase: "reserved" })],
      new Map([
        ["copy-a", printingOne],
        ["copy-b", printingOne],
      ]),
    );

    expect(byCopy.get("copy-a")?.phase).toBe("reserved");
    expect(byCopy.get("copy-b")?.phase).toBe("reserved");
  });

  it("keeps each copy on its own printing's annotation", () => {
    const byCopy = tradeAnnotationByCopyId(
      [
        annotation({ printingId: "p-1", phase: "reserved" }),
        annotation({ printingId: "p-2", phase: "asked" }),
      ],
      new Map([
        ["copy-a", printingOne],
        ["copy-b", printingTwo],
      ]),
    );

    expect(byCopy.get("copy-a")?.phase).toBe("reserved");
    expect(byCopy.get("copy-b")?.phase).toBe("asked");
  });

  it("omits copies whose printing has no live trade", () => {
    const byCopy = tradeAnnotationByCopyId(
      [annotation({ printingId: "p-2" })],
      new Map([["copy-a", printingOne]]),
    );

    expect(byCopy.has("copy-a")).toBe(false);
  });

  it("returns an empty map while the annotations are still loading", () => {
    expect(tradeAnnotationByCopyId(undefined, new Map([["copy-a", printingOne]])).size).toBe(0);
  });

  it("collapses several live trades on one printing to the most committed", () => {
    const byCopy = tradeAnnotationByCopyId(
      [
        annotation({ printingId: "p-1", phase: "asked", quantity: 4 }),
        annotation({ printingId: "p-1", phase: "reserved", quantity: 1 }),
      ],
      new Map([["copy-a", printingOne]]),
    );

    expect(byCopy.get("copy-a")?.phase).toBe("reserved");
  });
});
