import { describe, expect, it } from "vitest";

import { hydrateListRules, listRulesSchema, normalizeListRules } from "./list-rule";
import type { ListRules } from "./list-rule";
import { EMPTY_CARD_FILTERS } from "./search";

// A trade rule whose persisted filter predates the `presence` / `keywords` /
// `keywordsExclude` dimensions — the exact shape that 500'd the list detail
// endpoint (ADR-034). It also carries the superseded `hasAnyMarker` key.
function staleTradeRule() {
  const filter = { ...EMPTY_CARD_FILTERS, hasAnyMarker: null } as Record<string, unknown>;
  delete filter.presence;
  delete filter.keywords;
  delete filter.keywordsExclude;
  return {
    kind: "trade",
    filter,
    collectionIds: ["019e2fa1-8cdc-7a3a-810e-d5a09f31c19e"],
    keepPerCard: { mode: "fixed", n: 0 },
    excludeCopyIds: [],
  };
}

describe("listRulesSchema output validation", () => {
  it("re-validates a persisted rule missing a newer dimension (no 500)", () => {
    // Regression: `listDetailListResponseSchema` embeds `listRulesSchema`, so
    // oRPC re-validates the persisted rule on the read path. Before the filter
    // dimensions carried defaults, an older rule threw "Output validation
    // failed" and the list detail endpoint returned 500.
    const result = listRulesSchema.safeParse([staleTradeRule()]);
    expect(result.success).toBe(true);
    if (result.success) {
      const filter = result.data[0].filter;
      expect(filter.presence).toEqual({});
      expect(filter.keywords).toEqual([]);
      expect(filter.keywordsExclude).toEqual([]);
    }
  });
});

describe("normalizeListRules", () => {
  it("backfills every rule's filter against the blank set", () => {
    const stale = staleTradeRule().filter as Record<string, unknown>;
    const normalized = normalizeListRules([
      { ...staleTradeRule(), filter: stale } as unknown as ListRules[number],
    ]);
    expect(normalized[0].filter.presence).toEqual({});
    expect(normalized[0].filter.keywords).toEqual([]);
    expect(normalized[0].filter.keywordsExclude).toEqual([]);
  });
});

describe("hydrateListRules", () => {
  it("returns an empty array for null/undefined", () => {
    expect(hydrateListRules(null)).toEqual([]);
    expect(hydrateListRules(undefined)).toEqual([]);
  });

  it("parses a JSON string (postgres.js jsonb under Bun) and normalizes it", () => {
    const hydrated = hydrateListRules(JSON.stringify([staleTradeRule()]));
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].filter.presence).toEqual({});
    expect(hydrated[0].filter.keywords).toEqual([]);
    expect(hydrated[0].filter.keywordsExclude).toEqual([]);
  });

  it("normalizes an already-parsed value", () => {
    const hydrated = hydrateListRules([staleTradeRule()] as unknown as ListRules);
    expect(hydrated[0].filter.keywordsExclude).toEqual([]);
  });
});
