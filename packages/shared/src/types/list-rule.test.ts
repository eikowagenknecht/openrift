import { describe, expect, it } from "vitest";

import {
  defaultRuleCombine,
  hydrateListRules,
  listRulesSchema,
  normalizeListRules,
  ruleCombineMatchesKind,
  ruleKindForListKind,
  TRADE_RULE_COMBINES,
  WISH_RULE_COMBINES,
} from "./list-rule";
import type { ListRules } from "./list-rule";
import { EMPTY_CARD_FILTERS } from "./search";

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
    const result = listRulesSchema.safeParse([staleTradeRule()]);
    expect(result.success).toBe(true);
    if (result.success) {
      const filter = result.data[0]!.filter;
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
    expect(normalized[0]!.filter.presence).toEqual({});
    expect(normalized[0]!.filter.keywords).toEqual([]);
    expect(normalized[0]!.filter.keywordsExclude).toEqual([]);
  });
});

describe("hydrateListRules", () => {
  it("returns an empty array for null/undefined", () => {
    expect(hydrateListRules(null)).toEqual([]);
    expect(hydrateListRules(undefined)).toEqual([]);
  });

  it("backfills missing filter dimensions on a stale rule", () => {
    const hydrated = hydrateListRules([staleTradeRule()] as unknown as ListRules);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]!.filter.presence).toEqual({});
    expect(hydrated[0]!.filter.keywords).toEqual([]);
    expect(hydrated[0]!.filter.keywordsExclude).toEqual([]);
  });

  it("carries priceMarketplace through the round trip", () => {
    const rule = { ...staleTradeRule(), priceMarketplace: "cardmarket" };
    const hydrated = hydrateListRules([rule] as unknown as ListRules);
    expect(hydrated[0]!.priceMarketplace).toBe("cardmarket");
  });
});

describe("ruleKindForListKind", () => {
  it("gives copy lists the supply shape and the rest the demand shape", () => {
    expect(ruleKindForListKind("copy")).toBe("trade");
    expect(ruleKindForListKind("card")).toBe("wish");
    expect(ruleKindForListKind("printing")).toBe("wish");
  });

  it("agrees with the intent it replaced for every pre-existing combo", () => {
    expect(ruleKindForListKind("card")).toBe("wish");
    expect(ruleKindForListKind("printing")).toBe("wish");
    expect(ruleKindForListKind("copy")).toBe("trade");
  });
});

describe("defaultRuleCombine", () => {
  it("defaults copy lists to protect and card/printing lists to sum", () => {
    expect(defaultRuleCombine("copy")).toBe("protect");
    expect(defaultRuleCombine("card")).toBe("sum");
    expect(defaultRuleCombine("printing")).toBe("sum");
  });

  it("returns a mode that is itself valid for the kind", () => {
    for (const kind of ["card", "printing", "copy"] as const) {
      expect(ruleCombineMatchesKind(defaultRuleCombine(kind), kind)).toBe(true);
    }
  });
});

describe("ruleCombineMatchesKind", () => {
  it("accepts every quantity mode on card/printing lists and rejects the copy ones", () => {
    for (const kind of ["card", "printing"] as const) {
      for (const combine of WISH_RULE_COMBINES) {
        expect(ruleCombineMatchesKind(combine, kind)).toBe(true);
      }
      for (const combine of TRADE_RULE_COMBINES) {
        expect(ruleCombineMatchesKind(combine, kind)).toBe(false);
      }
    }
  });

  it("accepts every keep/offer mode on copy lists and rejects the quantity ones", () => {
    for (const combine of TRADE_RULE_COMBINES) {
      expect(ruleCombineMatchesKind(combine, "copy")).toBe(true);
    }
    for (const combine of WISH_RULE_COMBINES) {
      expect(ruleCombineMatchesKind(combine, "copy")).toBe(false);
    }
  });
});
