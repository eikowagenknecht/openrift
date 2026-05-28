import type { CompletionScopePreference } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildMissingSearch } from "./stats-missing-search";

const setIdToSlug = new Map([
  ["set-ogn", "OGN"],
  ["set-prx", "PRX"],
]);

const emptyScope: CompletionScopePreference = {};

describe("buildMissingSearch", () => {
  it("returns undefined when countMode is not 'cards'", () => {
    // The /cards browser filters at the card level, so per-printing modes
    // (printings/copies) have no equivalent URL to land on.
    expect(
      buildMissingSearch({
        countMode: "printings",
        groupBy: "set",
        key: "set-ogn",
        scope: emptyScope,
        setIdToSlug,
      }),
    ).toBeUndefined();
    expect(
      buildMissingSearch({
        countMode: "copies",
        groupBy: "set",
        key: "set-ogn",
        scope: emptyScope,
        setIdToSlug,
      }),
    ).toBeUndefined();
  });

  it("emits a typed owned array (not a 'false' string) for cards-mode set rows", () => {
    // Regression: the prior URL builder set `owned=false`, which is not a valid
    // OwnedBucket value and got dropped by validateSearch — so the link landed
    // on an unfiltered /cards page. The fix narrows to the two not-complete
    // buckets and uses the set slug, not the set id.
    const search = buildMissingSearch({
      countMode: "cards",
      groupBy: "set",
      key: "set-ogn",
      scope: emptyScope,
      setIdToSlug,
    });
    expect(search).toEqual({
      owned: ["none", "partial"],
      sets: ["OGN"],
    });
  });

  it("uses the row key directly for domain / rarity / type group rows", () => {
    expect(
      buildMissingSearch({
        countMode: "cards",
        groupBy: "domain",
        key: "fury",
        scope: emptyScope,
        setIdToSlug,
      }),
    ).toEqual({ owned: ["none", "partial"], domains: ["fury"] });

    expect(
      buildMissingSearch({
        countMode: "cards",
        groupBy: "rarity",
        key: "epic",
        scope: emptyScope,
        setIdToSlug,
      }),
    ).toEqual({ owned: ["none", "partial"], rarities: ["epic"] });

    expect(
      buildMissingSearch({
        countMode: "cards",
        groupBy: "type",
        key: "unit",
        scope: emptyScope,
        setIdToSlug,
      }),
    ).toEqual({ owned: ["none", "partial"], types: ["unit"] });
  });

  it("group key overrides any scope-derived value for the same axis", () => {
    const scope: CompletionScopePreference = { sets: ["PRX"], domains: ["calm"] };
    const search = buildMissingSearch({
      countMode: "cards",
      groupBy: "set",
      key: "set-ogn",
      scope,
      setIdToSlug,
    });
    expect(search?.sets).toEqual(["OGN"]);
    expect(search?.domains).toEqual(["calm"]);
  });

  it("omits the set narrow when the set id is not in the slug map", () => {
    const search = buildMissingSearch({
      countMode: "cards",
      groupBy: "set",
      key: "set-unknown",
      scope: { sets: ["PRX"] },
      setIdToSlug,
    });
    expect(search?.sets).toEqual(["PRX"]);
  });

  it("forwards scope arrays and tri-state filters as typed values", () => {
    const scope: CompletionScopePreference = {
      languages: ["en"],
      finishes: ["foil"],
      artVariants: ["full-art"],
      promos: "exclude",
      signed: true,
      banned: false,
      errata: true,
    };
    const search = buildMissingSearch({
      countMode: "cards",
      groupBy: "domain",
      key: "fury",
      scope,
      setIdToSlug,
    });
    expect(search).toEqual({
      owned: ["none", "partial"],
      languages: ["en"],
      finishes: ["foil"],
      artVariants: ["full-art"],
      promo: false,
      signed: true,
      banned: false,
      errata: true,
      domains: ["fury"],
    });
  });

  it("maps promos='only' to promo=true", () => {
    const search = buildMissingSearch({
      countMode: "cards",
      groupBy: "domain",
      key: "fury",
      scope: { promos: "only" },
      setIdToSlug,
    });
    expect(search?.promo).toBe(true);
  });

  it("omits empty scope arrays from the payload", () => {
    // empty arrays would still survive `value && value.length > 0` if we used
    // truthiness alone; the helper must drop them so the /cards URL stays clean.
    const search = buildMissingSearch({
      countMode: "cards",
      groupBy: "domain",
      key: "fury",
      scope: { sets: [], languages: [], domains: [] },
      setIdToSlug,
    });
    expect(search).toEqual({ owned: ["none", "partial"], domains: ["fury"] });
  });
});
