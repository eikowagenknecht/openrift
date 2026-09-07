import { describe, expect, it } from "vitest";

import { deckListSearchSchema } from "./deck-list-search";

describe("deckListSearchSchema", () => {
  it("parses a fully-populated search", () => {
    expect(
      deckListSearchSchema.parse({
        search: "aggro",
        formats: ["constructed"],
        validity: "invalid",
        domains: ["fury", "calm"],
        archived: true,
      }),
    ).toEqual({
      search: "aggro",
      formats: ["constructed"],
      validity: "invalid",
      domains: ["fury", "calm"],
      archived: true,
    });
  });

  it("leaves an empty search empty", () => {
    expect(deckListSearchSchema.parse({})).toEqual({});
  });

  it("drops a validity value the list can't apply", () => {
    expect(deckListSearchSchema.parse({ validity: "kinda" }).validity).toBeUndefined();
  });

  it("drops wrongly-typed values instead of throwing", () => {
    const parsed = deckListSearchSchema.parse({
      search: 42,
      domains: "fury",
      archived: "yes",
    });
    expect(parsed.search).toBeUndefined();
    expect(parsed.domains).toBeUndefined();
    expect(parsed.archived).toBeUndefined();
  });

  it("strips keys it doesn't know", () => {
    expect(deckListSearchSchema.parse({ formats: ["freeform"], legend: "vi" })).toEqual({
      formats: ["freeform"],
    });
  });

  it("accepts any format slug, since formats come from the reference table", () => {
    expect(deckListSearchSchema.parse({ formats: ["some-future-format"] }).formats).toEqual([
      "some-future-format",
    ]);
  });
});
