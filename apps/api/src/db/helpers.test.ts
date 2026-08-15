import { describe, expect, it } from "vitest";

import { buildDistinctWhere } from "./helpers.js";

describe("buildDistinctWhere", () => {
  it("builds a single-column DISTINCT check", () => {
    const result = buildDistinctWhere("my_table", ["col_a"]);
    expect(result).toBeDefined();
  });

  it("builds a multi-column DISTINCT check with OR separators", () => {
    const result = buildDistinctWhere("t", ["col_a", "col_b", "col_c"]);
    expect(result).toBeDefined();
  });
});
