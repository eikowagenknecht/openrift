import { describe, expect, it } from "vitest";

import { cardsSearchSchema } from "./cards-search-schema";

describe("cardsSearchSchema", () => {
  it("strips customTags from parsed search so /cards doesn't filter every card out", () => {
    const parsed = cardsSearchSchema.parse({
      search: "t:Teemo",
      types: ["unit"],
      customTags: ["bandle-city", "bilgewater"],
    });
    expect(parsed).not.toHaveProperty("customTags");
    expect(parsed.search).toBe("t:Teemo");
    expect(parsed.types).toEqual(["unit"]);
  });

  it("preserves other filter params unchanged", () => {
    const parsed = cardsSearchSchema.parse({
      sets: ["ogn"],
      domains: ["mind", "chaos"],
      languages: ["EN"],
      printingId: "p-123",
    });
    expect(parsed).toEqual({
      sets: ["ogn"],
      domains: ["mind", "chaos"],
      languages: ["EN"],
      printingId: "p-123",
    });
  });
});
