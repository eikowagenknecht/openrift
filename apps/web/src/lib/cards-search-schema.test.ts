import { describe, expect, it } from "vitest";

import { cardsSearchSchema } from "./cards-search-schema";

describe("cardsSearchSchema", () => {
  // Regression: navigating from a deck (which exposes `customTags`) to /cards
  // used to carry `customTags` through into the catalog filter, where it had
  // no `customTagAssignments` wired in and silently filtered every card out.
  // The /cards route relies on the schema dropping the key so its beforeLoad
  // redirect cleans the URL.
  it("strips customTags from parsed search", () => {
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
