import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { MatchStatus, MatchedEntry } from "./import-matcher";
import type { ImportEntry } from "./import-parsers";
import { classifyBucket, getImportBucket, summarizeMatchedEntries } from "./import-summary";

const STUB_PRINTING = { id: "p1", shortCode: "OGS-001" } as Printing;

function makeEntry(quantity: number): ImportEntry {
  return {
    setPrefix: "OGS",
    finish: "normal",
    artVariant: "normal",
    quantity,
    cardName: "Card",
    sourceCode: "OGS-001",
    rawFields: {},
  };
}

function makeMatched(status: MatchStatus, resolved: boolean, quantity = 1): MatchedEntry {
  return {
    entry: makeEntry(quantity),
    status,
    resolvedPrinting: resolved ? STUB_PRINTING : null,
    candidates: [],
  };
}

describe("classifyBucket", () => {
  it("treats an exact status as ready regardless of resolution", () => {
    expect(classifyBucket("exact", true)).toBe("ready");
    expect(classifyBucket("exact", false)).toBe("ready");
  });

  it("treats a resolved non-exact row as to-verify", () => {
    expect(classifyBucket("needs-review", true)).toBe("to-verify");
  });

  it("treats an unresolved row as need-attention", () => {
    expect(classifyBucket("needs-review", false)).toBe("need-attention");
    expect(classifyBucket("unresolved", false)).toBe("need-attention");
  });
});

describe("getImportBucket", () => {
  it("classifies an exact match as ready", () => {
    expect(getImportBucket(makeMatched("exact", true))).toBe("ready");
  });

  it("classifies a resolved needs-review row as to-verify", () => {
    expect(getImportBucket(makeMatched("needs-review", true))).toBe("to-verify");
  });

  it("classifies an unresolved needs-review row as need-attention", () => {
    expect(getImportBucket(makeMatched("needs-review", false))).toBe("need-attention");
  });

  it("classifies an unresolved match as need-attention", () => {
    expect(getImportBucket(makeMatched("unresolved", false))).toBe("need-attention");
  });
});

describe("summarizeMatchedEntries", () => {
  it("buckets entries and sums importable quantities", () => {
    const entries = [
      makeMatched("exact", true, 2),
      makeMatched("needs-review", true, 3),
      makeMatched("needs-review", false),
      makeMatched("unresolved", false),
    ];
    const summary = summarizeMatchedEntries(entries, new Set());
    expect(summary).toEqual({
      readyCount: 1,
      toVerifyCount: 1,
      needsAttentionCount: 2,
      importableCount: 2,
      totalCards: 5,
    });
  });

  it("excludes skipped rows from every count", () => {
    const entries = [makeMatched("exact", true, 4), makeMatched("needs-review", true, 6)];
    const summary = summarizeMatchedEntries(entries, new Set([1]));
    expect(summary).toEqual({
      readyCount: 1,
      toVerifyCount: 0,
      needsAttentionCount: 0,
      importableCount: 1,
      totalCards: 4,
    });
  });

  it("returns all-zero counts for no entries", () => {
    expect(summarizeMatchedEntries([], new Set())).toEqual({
      readyCount: 0,
      toVerifyCount: 0,
      needsAttentionCount: 0,
      importableCount: 0,
      totalCards: 0,
    });
  });
});
