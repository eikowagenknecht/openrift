import { describe, expect, it } from "vitest";

import type { MatchedEntry } from "@/lib/import-matcher";
import { stubPrinting } from "@/test/factories";

import { buildListImportPayload, promoteToExact } from "./use-list-import-flow";

function matched(overrides: Partial<MatchedEntry>): MatchedEntry {
  return {
    entry: {
      setPrefix: "",
      finish: "normal",
      artVariant: "normal",
      quantity: 1,
      cardName: "Teemo, Scout",
      sourceCode: "",
      rawFields: {},
    },
    status: "needs-review",
    resolvedPrinting: null,
    candidates: [],
    ...overrides,
  };
}

describe("promoteToExact", () => {
  it("leaves exact matches untouched", () => {
    const printing = stubPrinting();
    const input = matched({ status: "exact", resolvedPrinting: printing, candidates: [printing] });
    expect(promoteToExact(input)).toBe(input);
  });

  it("promotes to exact when all candidates belong to the same card", () => {
    const normal = stubPrinting({ cardId: "card-1", finish: "normal" });
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const result = promoteToExact(
      matched({ status: "needs-review", candidates: [normal, foil], resolvedPrinting: null }),
    );
    expect(result.status).toBe("exact");
    expect(result.resolvedPrinting).toBe(normal);
  });

  it("preserves a pre-resolved printing when promoting", () => {
    const normal = stubPrinting({ cardId: "card-1", finish: "normal" });
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const result = promoteToExact(
      matched({ status: "needs-review", candidates: [normal, foil], resolvedPrinting: foil }),
    );
    expect(result.status).toBe("exact");
    expect(result.resolvedPrinting).toBe(foil);
  });

  it("leaves needs-review when candidates span multiple cards", () => {
    const printingA = stubPrinting({ cardId: "card-1" });
    const printingB = stubPrinting({ cardId: "card-2" });
    const input = matched({
      status: "needs-review",
      candidates: [printingA, printingB],
      resolvedPrinting: null,
    });
    expect(promoteToExact(input)).toBe(input);
  });

  it("leaves unresolved entries with no candidates alone", () => {
    const input = matched({ status: "unresolved", candidates: [], resolvedPrinting: null });
    expect(promoteToExact(input)).toBe(input);
  });
});

describe("buildListImportPayload", () => {
  it("sends cardId for card-kind lists", () => {
    const printing = stubPrinting({ id: "printing-1", cardId: "card-1" });
    const entries = [
      matched({ status: "exact", resolvedPrinting: printing, candidates: [printing] }),
    ];
    expect(buildListImportPayload(entries, "card")).toEqual([{ cardId: "card-1", quantity: 1 }]);
  });

  it("sends printingId for printing-kind lists", () => {
    const printing = stubPrinting({ id: "printing-1", cardId: "card-1" });
    const entries = [
      matched({ status: "exact", resolvedPrinting: printing, candidates: [printing] }),
    ];
    expect(buildListImportPayload(entries, "printing")).toEqual([
      { printingId: "printing-1", quantity: 1 },
    ]);
  });

  it("carries each row's quantity through", () => {
    const printing = stubPrinting({ id: "printing-9", cardId: "card-9" });
    const entries = [
      matched({
        status: "exact",
        resolvedPrinting: printing,
        candidates: [printing],
        entry: {
          setPrefix: "",
          finish: "normal",
          artVariant: "normal",
          quantity: 4,
          cardName: "Fury Rune",
          sourceCode: "",
          rawFields: {},
        },
      }),
    ];
    expect(buildListImportPayload(entries, "printing")).toEqual([
      { printingId: "printing-9", quantity: 4 },
    ]);
  });
});
