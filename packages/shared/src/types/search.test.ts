import { describe, expect, it } from "vitest";

import { cardFiltersSchema, EMPTY_CARD_FILTERS } from "./search";

describe("cardFiltersSchema defaults", () => {
  it("parses an empty object into the blank filter set, catching any dimension missing a default", () => {
    expect(cardFiltersSchema.parse({})).toEqual(EMPTY_CARD_FILTERS);
  });

  it("backfills dimensions absent from a persisted filter to 'no constraint'", () => {
    const stale = { ...EMPTY_CARD_FILTERS } as Record<string, unknown>;
    delete stale.presence;
    delete stale.keywords;
    delete stale.keywordsExclude;

    const parsed = cardFiltersSchema.parse(stale);
    expect(parsed.presence).toEqual({});
    expect(parsed.keywords).toEqual([]);
    expect(parsed.keywordsExclude).toEqual([]);
  });

  it("drops a superseded key like the old hasAnyMarker boolean", () => {
    const withSuperseded = { ...EMPTY_CARD_FILTERS, hasAnyMarker: true };
    expect("hasAnyMarker" in cardFiltersSchema.parse(withSuperseded)).toBe(false);
  });

  it("preserves explicitly-set dimensions", () => {
    const parsed = cardFiltersSchema.parse({
      ...EMPTY_CARD_FILTERS,
      rarities: ["rare"],
      keywords: ["Shield"],
      isBanned: true,
    });
    expect(parsed.rarities).toEqual(["rare"]);
    expect(parsed.keywords).toEqual(["Shield"]);
    expect(parsed.isBanned).toBe(true);
  });
});
