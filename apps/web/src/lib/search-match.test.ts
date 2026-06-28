import { describe, expect, it } from "vitest";

import { matchesAllTokens, normalizedStartsWith, searchTokens } from "./search-match";

describe("searchTokens", () => {
  it("splits on whitespace and strips punctuation", () => {
    expect(searchTokens("Annie, Dark")).toEqual(["annie", "dark"]);
  });

  it("lowercases and drops non-alphanumerics within a word", () => {
    expect(searchTokens("Kai'Sa")).toEqual(["kaisa"]);
  });

  it("collapses repeated whitespace and ignores empty words", () => {
    expect(searchTokens("  annie   dark  ")).toEqual(["annie", "dark"]);
  });

  it("returns an empty array for a punctuation-only query", () => {
    expect(searchTokens(", -")).toEqual([]);
  });
});

describe("matchesAllTokens", () => {
  it("matches across the comma that broke the old substring search", () => {
    expect(matchesAllTokens(searchTokens("annie dark"), "Annie, Dark Child")).toBe(true);
  });

  it("matches regardless of token order", () => {
    expect(matchesAllTokens(searchTokens("dark annie"), "Annie, Dark Child")).toBe(true);
  });

  it("matches non-adjacent words", () => {
    expect(matchesAllTokens(searchTokens("annie child"), "Annie, Dark Child")).toBe(true);
  });

  it("requires every token to be present", () => {
    expect(matchesAllTokens(searchTokens("annie azir"), "Annie, Dark Child")).toBe(false);
  });

  it("lets tokens match across separate haystacks (name and short code)", () => {
    expect(matchesAllTokens(searchTokens("annie 021"), "Annie, Dark Child", "OGS-021")).toBe(true);
  });

  it("normalizes the short code so a dashed query matches", () => {
    expect(matchesAllTokens(searchTokens("ogs-021"), "Annie, Dark Child", "OGS-021")).toBe(true);
  });

  it("returns false when there are no tokens", () => {
    expect(matchesAllTokens([], "Annie, Dark Child")).toBe(false);
  });
});

describe("normalizedStartsWith", () => {
  it("ignores punctuation and spacing when comparing the prefix", () => {
    expect(normalizedStartsWith("Annie, Dark Child", "annie dark")).toBe(true);
  });

  it("is false when the normalized text does not start with the query", () => {
    expect(normalizedStartsWith("Annie, Dark Child", "dark")).toBe(false);
  });

  it("is false for an empty query", () => {
    expect(normalizedStartsWith("Annie, Dark Child", "")).toBe(false);
  });
});
