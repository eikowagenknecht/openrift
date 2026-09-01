import { describe, expect, it } from "vitest";

import type { EraSet } from "./meta-scope";
import {
  CLEARED_SCOPE,
  deriveSetEras,
  ERA_ALL,
  ERA_CUSTOM,
  isScopeNarrowed,
  metaScopeSearchSchema,
  nextScopeSearch,
  resolveScopeRange,
} from "./meta-scope";

function set(slug: string, name: string, releasedAt: string | null, main = true): EraSet {
  return {
    slug,
    name,
    setType: main ? "main" : "supplemental",
    releases: releasedAt === null ? {} : { en: { releasedAt, precision: "day" as const } },
  };
}

const TODAY = "2026-08-30";

describe("deriveSetEras", () => {
  it("runs each era up to the day before the next set", () => {
    const eras = deriveSetEras(
      [set("origins", "Origins", "2025-10-31"), set("proving", "Proving Grounds", "2026-03-06")],
      TODAY,
    );
    expect(eras).toEqual([
      { id: "proving", label: "Proving Grounds", from: "2026-03-06", to: null },
      { id: "origins", label: "Origins", from: "2025-10-31", to: "2026-03-05" },
    ]);
  });

  it("leaves the current era open-ended", () => {
    const eras = deriveSetEras([set("origins", "Origins", "2025-10-31")], TODAY);
    expect(eras[0].to).toBeNull();
  });

  it("orders newest first regardless of input order", () => {
    const eras = deriveSetEras(
      [set("proving", "Proving Grounds", "2026-03-06"), set("origins", "Origins", "2025-10-31")],
      TODAY,
    );
    expect(eras.map((era) => era.id)).toEqual(["proving", "origins"]);
  });

  it("crosses a month boundary without landing on day zero", () => {
    const eras = deriveSetEras([set("a", "A", "2025-10-31"), set("b", "B", "2026-03-01")], TODAY);
    expect(eras[1].to).toBe("2026-02-28");
  });

  it("ignores supplemental products, which do not start a season", () => {
    const eras = deriveSetEras(
      [set("origins", "Origins", "2025-10-31"), set("promo", "Promo Pack", "2026-01-15", false)],
      TODAY,
    );
    expect(eras.map((era) => era.id)).toEqual(["origins"]);
    expect(eras[0].to).toBeNull();
  });

  it("ignores sets that are not out yet", () => {
    const eras = deriveSetEras(
      [set("origins", "Origins", "2025-10-31"), set("future", "Future", "2027-01-01")],
      TODAY,
    );
    expect(eras.map((era) => era.id)).toEqual(["origins"]);
  });

  it("ignores undated sets", () => {
    const eras = deriveSetEras([set("tba", "TBA", null)], TODAY);
    expect(eras).toEqual([]);
  });

  it("has no eras without sets", () => {
    expect(deriveSetEras([], TODAY)).toEqual([]);
  });
});

describe("resolveScopeRange", () => {
  const eras = deriveSetEras(
    [set("origins", "Origins", "2025-10-31"), set("proving", "Proving Grounds", "2026-03-06")],
    TODAY,
  );

  it("has no bounds without an era", () => {
    expect(resolveScopeRange({}, eras)).toEqual({});
  });

  it("has no bounds on all time", () => {
    expect(resolveScopeRange({ era: ERA_ALL }, eras)).toEqual({});
  });

  it("takes both bounds from the named era", () => {
    expect(resolveScopeRange({ era: "origins" }, eras)).toEqual({
      from: "2025-10-31",
      to: "2026-03-05",
    });
  });

  it("leaves the current era's upper bound open", () => {
    expect(resolveScopeRange({ era: "proving" }, eras)).toEqual({ from: "2026-03-06" });
  });

  it("takes a custom range from the scope's own bounds", () => {
    expect(
      resolveScopeRange({ era: ERA_CUSTOM, from: "2026-01-01", to: "2026-02-01" }, eras),
    ).toEqual({ from: "2026-01-01", to: "2026-02-01" });
  });

  it("allows a half-open custom range", () => {
    expect(resolveScopeRange({ era: ERA_CUSTOM, from: "2026-01-01" }, eras)).toEqual({
      from: "2026-01-01",
      to: undefined,
    });
  });

  it("falls back to all time when a bookmarked era no longer exists", () => {
    expect(resolveScopeRange({ era: "retired" }, eras)).toEqual({});
  });
});

describe("isScopeNarrowed", () => {
  it("is false for an empty scope", () => {
    expect(isScopeNarrowed({})).toBe(false);
  });

  it("is false for an explicit all-time era", () => {
    expect(isScopeNarrowed({ era: ERA_ALL })).toBe(false);
  });

  it("is true for any single facet", () => {
    expect(isScopeNarrowed({ era: "origins" })).toBe(true);
    expect(isScopeNarrowed({ formats: ["standard"] })).toBe(true);
    expect(isScopeNarrowed({ tiers: ["premier"] })).toBe(true);
    expect(isScopeNarrowed({ countries: ["de"] })).toBe(true);
  });

  it("counts custom bounds", () => {
    expect(isScopeNarrowed({ era: ERA_CUSTOM })).toBe(true);
    expect(isScopeNarrowed({ era: ERA_CUSTOM, from: "2026-01-01" })).toBe(true);
  });
});

describe("nextScopeSearch", () => {
  it("merges the patch over the current params", () => {
    expect(nextScopeSearch({ era: "origins" }, { tiers: ["premier"] })).toEqual({
      era: "origins",
      tiers: ["premier"],
    });
  });

  it("drops a facet the patch clears rather than writing an empty one", () => {
    expect(nextScopeSearch({ era: "origins", tiers: ["premier"] }, { tiers: undefined })).toEqual({
      era: "origins",
    });
  });

  it("drops an emptied facet, so the unnarrowed view keeps a clean URL", () => {
    expect(nextScopeSearch({ countries: ["de"] }, { countries: [] })).toEqual({});
    expect(nextScopeSearch({ era: "origins" }, { era: "" })).toEqual({});
  });

  it("leaves params the scope knows nothing about alone", () => {
    expect(nextScopeSearch({ page: 3, q: "kennen" }, { tiers: ["premier"] })).toEqual({
      page: 3,
      q: "kennen",
      tiers: ["premier"],
    });
  });

  it("returns to all time on the cleared patch", () => {
    expect(
      nextScopeSearch({ era: "origins", tiers: ["premier"], q: "kennen" }, CLEARED_SCOPE),
    ).toEqual({ q: "kennen" });
  });
});

describe("metaScopeSearchSchema", () => {
  it("keeps every facet it is given, includes and excludes alike", () => {
    const scope = {
      era: "origins",
      formats: ["standard"],
      tiers: ["premier", "store"],
      countriesEx: ["de"],
    };
    expect(metaScopeSearchSchema.parse(scope)).toEqual(scope);
  });

  it("reads a hand-written single value as a one-value facet", () => {
    expect(metaScopeSearchSchema.parse({ tiers: "premier" })).toEqual({ tiers: ["premier"] });
  });

  it("drops a bad value instead of throwing, so a stale bookmark still loads", () => {
    expect(metaScopeSearchSchema.parse({ era: 7, tiers: 3, countries: ["de"] })).toEqual({
      era: undefined,
      tiers: undefined,
      countries: ["de"],
    });
  });
});
