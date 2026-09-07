import { describe, expect, it } from "vitest";

import { rulesSearchSchema } from "./rules-search-schema";

describe("rulesSearchSchema", () => {
  it("keeps a query", () => {
    expect(rulesSearchSchema({ q: "might" })).toEqual({ q: "might" });
  });

  it("drops an absent, blank or non-string query, so the URL never carries an empty q", () => {
    expect(rulesSearchSchema({})).toEqual({});
    expect(rulesSearchSchema({ q: "" })).toEqual({});
    expect(rulesSearchSchema({ q: "   " })).toEqual({});
    expect(rulesSearchSchema({ q: 7 })).toEqual({});
  });

  it("ignores params it does not own", () => {
    expect(rulesSearchSchema({ q: "might", other: "x" })).toEqual({ q: "might" });
  });
});
