import { describe, expect, it } from "vitest";

import { cleanedSearchForRedirect, filterSearchSchema } from "./search-schemas";

describe("filterSearchSchema enum params", () => {
  it("keeps known values for the enum-ish params", () => {
    const parsed = filterSearchSchema.parse({
      sort: "name",
      sortDir: "desc",
      view: "cards",
      groupBy: "rarity",
      groupDir: "desc",
    });
    expect(parsed.sort).toBe("name");
    expect(parsed.sortDir).toBe("desc");
    expect(parsed.view).toBe("cards");
    expect(parsed.groupBy).toBe("rarity");
    expect(parsed.groupDir).toBe("desc");
  });

  it("keeps /promos' card grouping axis", () => {
    expect(filterSearchSchema.parse({ groupBy: "card" }).groupBy).toBe("card");
  });

  it("coerces unknown enum-ish values to undefined instead of keeping junk", () => {
    const parsed = filterSearchSchema.parse({
      sort: "garbage",
      sortDir: "sideways",
      view: "table",
      groupBy: "year2",
      groupDir: "up",
    });
    expect(parsed.sort).toBeUndefined();
    expect(parsed.sortDir).toBeUndefined();
    expect(parsed.view).toBeUndefined();
    expect(parsed.groupBy).toBeUndefined();
    expect(parsed.groupDir).toBeUndefined();
  });

  it("coerces wrong-typed values to undefined", () => {
    const parsed = filterSearchSchema.parse({ groupBy: 3, sort: true });
    expect(parsed.groupBy).toBeUndefined();
    expect(parsed.sort).toBeUndefined();
  });

  it("keeps the printed-tags params, values verbatim", () => {
    const parsed = filterSearchSchema.parse({
      tags: ["Mount Targon", "Kha’Zix"],
      tagsEx: ["Poro"],
      tagsPresence: "none",
    });
    expect(parsed.tags).toEqual(["Mount Targon", "Kha’Zix"]);
    expect(parsed.tagsEx).toEqual(["Poro"]);
    expect(parsed.tagsPresence).toBe("none");
  });
});

describe("cleanedSearchForRedirect", () => {
  it("returns null when the URL is already clean", () => {
    const search = filterSearchSchema.parse({ sort: "name" });
    expect(cleanedSearchForRedirect(filterSearchSchema, search, "?sort=name")).toBeNull();
  });

  it("returns the cleaned params when the URL carries an unknown key", () => {
    // TanStack merges raw URL keys onto the validated search object, so an
    // unknown key arrives here alongside the valid ones.
    const search = { ...filterSearchSchema.parse({ sort: "name" }), promo: "true" };
    const cleaned = cleanedSearchForRedirect(filterSearchSchema, search, "?sort=name&promo=true");
    expect(cleaned).not.toBeNull();
    expect(cleaned?.sort).toBe("name");
    expect(cleaned && "promo" in cleaned).toBe(false);
  });

  it("returns the cleaned params when a known key carries an unknown value", () => {
    // `groupBy=garbage` coerces to undefined during validation; the raw URL
    // still carries the key, so the caller must redirect to drop it.
    const search = filterSearchSchema.parse({ groupBy: "garbage" });
    const cleaned = cleanedSearchForRedirect(filterSearchSchema, search, "?groupBy=garbage");
    expect(cleaned).not.toBeNull();
    expect(cleaned?.groupBy).toBeUndefined();
  });
});
