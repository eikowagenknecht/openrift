import { describe, expect, it } from "vitest";

import { KEYWORD_INFO, keywordAnchorSlug } from "./glossary";

describe("KEYWORD_INFO", () => {
  it("includes all 27 keywords currently registered in the database", () => {
    expect(Object.keys(KEYWORD_INFO)).toHaveLength(27);
  });

  it("gives every keyword a non-empty summary and a numeric rule reference", () => {
    for (const [name, entry] of Object.entries(KEYWORD_INFO)) {
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.ruleNumber).toMatch(/^\d+$/);
      expect(name).not.toBe("");
    }
  });
});

describe("keywordAnchorSlug", () => {
  it("returns a slug prefixed with 'keyword-'", () => {
    expect(keywordAnchorSlug("Ambush")).toBe("keyword-ambush");
  });

  it("normalises hyphenated keywords like 'Quick-Draw'", () => {
    expect(keywordAnchorSlug("Quick-Draw")).toBe("keyword-quick-draw");
  });
});
