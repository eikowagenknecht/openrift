import { describe, expect, it } from "vitest";

import { matches } from "./glossary-search";

describe("matches", () => {
  it("keeps every entry when the query is empty", () => {
    expect(matches("")).toBe(true);
    expect(matches("", "anything")).toBe(true);
  });

  it("matches a substring case-insensitively", () => {
    expect(matches("fur", "Fury")).toBe(true);
    expect(matches("FURY", "fury")).toBe(true);
  });

  it("folds a typed apostrophe onto the curly one in the copy", () => {
    expect(matches("champion's", "tied to your Champion’s tag")).toBe(true);
  });

  it("scans every field and ignores empty ones", () => {
    expect(matches("token", undefined, null, "", "Token")).toBe(true);
    expect(matches("token", undefined, null, "")).toBe(false);
  });

  it("returns false when no field contains the query", () => {
    expect(matches("battlefield", "Fury", "fury")).toBe(false);
  });
});
