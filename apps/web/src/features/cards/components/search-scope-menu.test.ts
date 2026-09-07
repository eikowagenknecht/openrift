import { ALL_SEARCH_FIELDS } from "@openrift/shared/types/search";
import { describe, expect, it } from "vitest";

import { SEARCH_FIELD_LABELS, scopeSummary } from "./search-scope-menu";

describe("scopeSummary", () => {
  it("collapses a full scope to 'all'", () => {
    expect(scopeSummary([...ALL_SEARCH_FIELDS])).toBe("all");
  });

  it("names a single field", () => {
    expect(scopeSummary(["keywords"])).toBe("keywords");
  });

  it("names two fields in full", () => {
    expect(scopeSummary(["name", "cardText"])).toBe("name, card text");
  });

  it("truncates three or more fields with a +N tail", () => {
    expect(scopeSummary(["name", "cardText", "keywords"])).toBe("name, card text +1");
    expect(scopeSummary(["name", "cardText", "keywords", "tags", "artist"])).toBe(
      "name, card text +3",
    );
  });

  it("preserves the caller's field order", () => {
    expect(scopeSummary(["tags", "name"])).toBe("tags, name");
  });

  it("returns an empty summary for an empty scope", () => {
    // The store refuses to empty the scope, so this only guards against a
    // corrupted persisted value rendering "in: undefined".
    expect(scopeSummary([])).toBe("");
  });
});

describe("SEARCH_FIELD_LABELS", () => {
  it("carries a label and a unique prefix for every searchable field", () => {
    const prefixes = new Set<string>();
    for (const field of ALL_SEARCH_FIELDS) {
      const entry = SEARCH_FIELD_LABELS[field];
      expect(entry.label).not.toBe("");
      expect(entry.prefix).toMatch(/^[a-z]+:$/u);
      prefixes.add(entry.prefix);
    }
    expect(prefixes.size).toBe(ALL_SEARCH_FIELDS.length);
  });
});
