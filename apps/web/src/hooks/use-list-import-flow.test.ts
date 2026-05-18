import { describe, expect, it } from "vitest";

import type { MatchedEntry } from "@/lib/import-matcher";
import { stubPrinting } from "@/test/factories";

import { promoteToExact } from "./use-list-import-flow";

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
