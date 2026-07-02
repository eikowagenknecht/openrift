import { describe, expect, it } from "vitest";

import { cardFiltersSchema, EMPTY_CARD_FILTERS } from "./search";

describe("cardFiltersSchema defaults", () => {
  it("parses an empty object into the blank filter set", () => {
    // Drift guard: every dimension must carry a `.default()`, so parsing `{}`
    // reconstructs EMPTY_CARD_FILTERS exactly. This fails the instant a new
    // dimension is added without a default — the same gap that let a persisted
    // rule 500 the list detail endpoint (ADR-034).
    expect(cardFiltersSchema.parse({})).toEqual(EMPTY_CARD_FILTERS);
  });

  it("backfills dimensions absent from a persisted filter", () => {
    // A rule saved before `presence` / `keywords` / `keywordsExclude` existed
    // lacks those keys. They must backfill to "no constraint" rather than fail.
    const stale = { ...EMPTY_CARD_FILTERS } as Record<string, unknown>;
    delete stale.presence;
    delete stale.keywords;
    delete stale.keywordsExclude;

    const parsed = cardFiltersSchema.parse(stale);
    expect(parsed.presence).toEqual({});
    expect(parsed.keywords).toEqual([]);
    expect(parsed.keywordsExclude).toEqual([]);
  });

  it("drops keys the schema no longer defines", () => {
    // `hasAnyMarker` was superseded by `presence.markers`; an old persisted rule
    // still carries it. The parse strips the unknown key.
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
