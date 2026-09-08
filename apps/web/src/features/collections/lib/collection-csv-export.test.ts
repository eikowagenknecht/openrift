import { describe, expect, it } from "vitest";

import { stubCopy, stubPrinting } from "@/test/factories";

import { buildCollectionCsv } from "./collection-csv-export";
import type { CsvExportLabels } from "./csv-export";

const LABELS: CsvExportLabels = {
  sets: { "set-alpha": "Set Alpha" },
  rarities: { common: "Common" },
  conditions: {},
  graders: {},
};

describe("buildCollectionCsv", () => {
  it("groups copies by printing and writes one row per printing", () => {
    const printing = stubPrinting({ id: "p1", card: { name: "Fury Rune" } });
    const copies = [
      stubCopy({ id: "c1", printingId: "p1" }),
      stubCopy({ id: "c2", printingId: "p1" }),
    ];

    const csv = buildCollectionCsv(copies, [printing], [], LABELS, "openrift");
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Fury Rune");
    expect(lines[1]?.split(",")).toContain("2");
  });

  it("drops copies whose printing is missing from the catalog", () => {
    const printing = stubPrinting({ id: "p1" });
    const copies = [
      stubCopy({ id: "c1", printingId: "p1" }),
      stubCopy({ id: "c2", printingId: "gone" }),
    ];

    const csv = buildCollectionCsv(copies, [printing], [], LABELS, "openrift");

    expect(csv.split("\n")).toHaveLength(2);
  });

  it("returns just the header when there are no copies", () => {
    const csv = buildCollectionCsv([], [], [], LABELS, "openrift");

    expect(csv.split("\n")).toHaveLength(1);
  });

  it("carries copy metadata like condition through to the row", () => {
    const printing = stubPrinting({ id: "p1" });
    const copies = [stubCopy({ id: "c1", printingId: "p1", condition: "near-mint" })];

    const csv = buildCollectionCsv(copies, [printing], [], LABELS, "openrift");

    expect(csv).toContain("near-mint");
  });

  it("orders rows by set using the given sets", () => {
    const printingB = stubPrinting({ id: "pB", setId: "set-b", card: { name: "Second" } });
    const printingA = stubPrinting({ id: "pA", setId: "set-a", card: { name: "First" } });
    const copies = [
      stubCopy({ id: "c1", printingId: "pB" }),
      stubCopy({ id: "c2", printingId: "pA" }),
    ];
    const sets = [
      { id: "set-a", slug: "a", name: "Set A" },
      { id: "set-b", slug: "b", name: "Set B" },
    ];

    const csv = buildCollectionCsv(copies, [printingA, printingB], sets, LABELS, "openrift");
    const lines = csv.split("\n");

    expect(lines[1]).toContain("First");
    expect(lines[2]).toContain("Second");
  });

  it("supports the other export formats", () => {
    const printing = stubPrinting({ id: "p1", card: { name: "Fury Rune" } });
    const copies = [stubCopy({ id: "c1", printingId: "p1" })];

    const csv = buildCollectionCsv(copies, [printing], [], LABELS, "riftcore");

    expect(csv).toContain("RIFTCORE COLLECTION EXPORT");
  });
});
