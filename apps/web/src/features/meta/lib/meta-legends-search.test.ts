import { describe, expect, it } from "vitest";

import {
  DEFAULT_LEGEND_DIRECTION,
  DEFAULT_LEGEND_SORT,
  metaLegendsSearchSchema,
} from "./meta-legends-search";

describe("metaLegendsSearchSchema", () => {
  it("leaves an untouched URL empty", () => {
    expect(metaLegendsSearchSchema.parse({})).toEqual({});
  });

  it("keeps a query string", () => {
    expect(metaLegendsSearchSchema.parse({ q: "Yasuo" }).q).toBe("Yasuo");
  });

  it("accepts every sort column", () => {
    for (const by of ["name", "best", "decklists", "finishes"]) {
      expect(metaLegendsSearchSchema.parse({ by }).by).toBe(by);
    }
  });

  it("drops an unknown sort column instead of failing", () => {
    expect(metaLegendsSearchSchema.parse({ by: "winrate" }).by).toBeUndefined();
  });

  it("accepts both directions", () => {
    expect(metaLegendsSearchSchema.parse({ dir: "desc" }).dir).toBe("desc");
    expect(metaLegendsSearchSchema.parse({ dir: "asc" }).dir).toBe("asc");
  });

  it("drops an unknown direction instead of failing", () => {
    expect(metaLegendsSearchSchema.parse({ dir: "sideways" }).dir).toBeUndefined();
  });

  it("drops a non-string query instead of failing", () => {
    expect(metaLegendsSearchSchema.parse({ q: 5 }).q).toBeUndefined();
  });

  it("carries the scope params the archive pages share", () => {
    const parsed = metaLegendsSearchSchema.parse({
      era: "ogn",
      formats: "constructed",
      countriesEx: ["DE"],
    });
    expect(parsed).toMatchObject({
      era: "ogn",
      formats: ["constructed"],
      countriesEx: ["DE"],
    });
  });

  it("keeps the sort out of the key the router unions across routes", () => {
    expect(Object.keys(metaLegendsSearchSchema.shape)).not.toContain("sort");
  });
});

describe("legend index defaults", () => {
  it("sorts by name ascending before the reader picks", () => {
    expect(DEFAULT_LEGEND_SORT).toBe("name");
    expect(DEFAULT_LEGEND_DIRECTION).toBe("asc");
  });

  it("names a sort the schema accepts", () => {
    expect(metaLegendsSearchSchema.parse({ by: DEFAULT_LEGEND_SORT }).by).toBe(DEFAULT_LEGEND_SORT);
  });
});
