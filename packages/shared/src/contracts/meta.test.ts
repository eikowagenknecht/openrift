import { describe, expect, it } from "vitest";

import {
  metaDateRangeQuerySchema,
  metaDeckQuerySchema,
  metaLegendQuerySchema,
  metaScopeQuerySchema,
} from "./meta.js";

describe("metaDateRangeQuerySchema", () => {
  it("accepts an absent window", () => {
    expect(metaDateRangeQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts either end on its own", () => {
    expect(metaDateRangeQuerySchema.safeParse({ from: "2026-01-01" }).success).toBe(true);
    expect(metaDateRangeQuerySchema.safeParse({ to: "2026-06-30" }).success).toBe(true);
  });

  it("accepts both ends", () => {
    const parsed = metaDateRangeQuerySchema.parse({ from: "2026-01-01", to: "2026-06-30" });

    expect(parsed).toEqual({ from: "2026-01-01", to: "2026-06-30" });
  });

  it.each(["2026-1-1", "01-01-2026", "2026-01-01T00:00:00Z", "yesterday", "2026-13-01", ""])(
    "rejects %s",
    (value) => {
      expect(metaDateRangeQuerySchema.safeParse({ from: value }).success).toBe(false);
    },
  );

  it("rejects a malformed upper bound", () => {
    expect(metaDateRangeQuerySchema.safeParse({ to: "2026-06-31" }).success).toBe(false);
  });
});

describe("metaScopeQuerySchema", () => {
  it("accepts a scope that narrows nothing", () => {
    expect(metaScopeQuerySchema.safeParse({}).success).toBe(true);
  });

  it("keeps a window and every facet pair", () => {
    const parsed = metaScopeQuerySchema.parse({
      from: "2026-01-01",
      to: "2026-06-30",
      formats: ["constructed"],
      formatsEx: [],
      tiers: ["premier", "competitive"],
      tiersEx: [],
      countries: ["DE"],
      countriesEx: [],
    });

    expect(parsed.tiers).toEqual(["premier", "competitive"]);
    expect(parsed.countries).toEqual(["DE"]);
  });

  it("takes a facet value the archive does not know, so a stale link narrows to nothing", () => {
    expect(metaScopeQuerySchema.safeParse({ tiers: ["retired-tier"] }).success).toBe(true);
  });

  it("rejects a facet that is not a list of non-empty strings", () => {
    expect(metaScopeQuerySchema.safeParse({ tiers: "premier" }).success).toBe(false);
    expect(metaScopeQuerySchema.safeParse({ tiers: [""] }).success).toBe(false);
    expect(metaScopeQuerySchema.safeParse({ tiers: [1] }).success).toBe(false);
  });

  it("rejects a bound that is not a calendar day", () => {
    expect(metaScopeQuerySchema.safeParse({ from: "2026-13-01" }).success).toBe(false);
  });
});

describe("metaDeckQuerySchema", () => {
  it("accepts a request that names nothing", () => {
    expect(metaDeckQuerySchema.safeParse({}).success).toBe(true);
  });

  it("reads a limit off the query string as a number", () => {
    expect(metaDeckQuerySchema.parse({ limit: "24" }).limit).toBe(24);
  });

  it("carries the scope's facets alongside the legend and the cap", () => {
    const parsed = metaDeckQuerySchema.parse({
      legend: "card-id",
      limit: "8",
      tiers: ["premier"],
      countriesEx: ["DE"],
    });

    expect(parsed).toEqual({
      legend: "card-id",
      limit: 8,
      tiers: ["premier"],
      countriesEx: ["DE"],
    });
  });

  it("rejects a facet that is not a list of non-empty strings", () => {
    expect(metaDeckQuerySchema.safeParse({ tiers: "premier" }).success).toBe(false);
    expect(metaDeckQuerySchema.safeParse({ countriesEx: [""] }).success).toBe(false);
  });

  it("keeps the legend and player keys", () => {
    const parsed = metaDeckQuerySchema.parse({ legend: "card-id", player: "renata" });

    expect(parsed).toEqual({ legend: "card-id", player: "renata" });
  });

  it.each([0, -1, 2.5, "many"])("rejects a limit of %s", (limit) => {
    expect(metaDeckQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects an empty legend or player key", () => {
    expect(metaDeckQuerySchema.safeParse({ legend: "" }).success).toBe(false);
    expect(metaDeckQuerySchema.safeParse({ player: "" }).success).toBe(false);
  });
});

describe("metaLegendQuerySchema", () => {
  it("requires the slug and defaults everything else to absent", () => {
    expect(metaLegendQuerySchema.parse({ slug: "kennen" })).toEqual({ slug: "kennen" });
    expect(metaLegendQuerySchema.safeParse({}).success).toBe(false);
  });

  it("carries the scope facets alongside the page", () => {
    const parsed = metaLegendQuerySchema.parse({
      slug: "kennen",
      tiers: ["premier"],
      countriesEx: ["DE"],
      page: "3",
    });

    expect(parsed.tiers).toEqual(["premier"]);
    expect(parsed.countriesEx).toEqual(["DE"]);
    expect(parsed.page).toBe(3);
  });

  it.each([0, -2, 1.5])("rejects page %s", (page) => {
    expect(metaLegendQuerySchema.safeParse({ slug: "kennen", page }).success).toBe(false);
  });
});
