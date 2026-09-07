import type { CompletionScopePreference } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildMissingSearch } from "./stats-missing-search";

const setIdToSlug = new Map([
  ["set-ogn", "OGN"],
  ["set-prx", "PRX"],
]);

const emptyScope: CompletionScopePreference = {};

describe("buildMissingSearch", () => {
  it("returns undefined for printing/copies count modes, which /cards can't filter at that level", () => {
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
      markersPresence: "none",
      signed: true,
      banned: false,
      errata: true,
      domains: ["fury"],
    });
  });

  it("forwards the scope's exclude arrays to the /cards exclude params", () => {
    const scope: CompletionScopePreference = {
      setsExclude: ["PRX"],
      languagesExclude: ["ja"],
      domainsExclude: ["mind"],
      typesExclude: ["rune"],
      raritiesExclude: ["common"],
      finishesExclude: ["foil"],
      artVariantsExclude: ["full-art"],
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
      setsEx: ["PRX"],
      languagesEx: ["ja"],
      domainsEx: ["mind"],
      typesEx: ["rune"],
      raritiesEx: ["common"],
      finishesEx: ["foil"],
      artVariantsEx: ["full-art"],
      domains: ["fury"],
    });
  });

  it("forwards keywords, tags, custom tags, size, standard and presence states", () => {
    const scope: CompletionScopePreference = {
      keywords: ["Unique"],
      tags: ["champion-spell"],
      customTags: ["staple"],
      cardSizes: ["oversized"],
      standard: true,
      keywordsPresence: "any",
      tagsPresence: "none",
      customTagsPresence: "any",
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
      keywords: ["Unique"],
      tags: ["champion-spell"],
      customTags: ["staple"],
      cardSizes: ["oversized"],
      standard: true,
      keywordsPresence: "any",
      tagsPresence: "none",
      customTagsPresence: "any",
      domains: ["fury"],
    });
  });

  it("maps promos='only' to markersPresence='any'", () => {
    const search = buildMissingSearch({
      countMode: "cards",
      groupBy: "domain",
      key: "fury",
      scope: { promos: "only" },
      setIdToSlug,
    });
    expect(search?.markersPresence).toBe("any");
  });

  it("omits empty scope arrays from the payload", () => {
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
