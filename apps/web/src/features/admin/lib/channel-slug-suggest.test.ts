import { describe, expect, it } from "vitest";

import { commonSlugPrefix, slugifyLabel, suggestChannelSlug } from "./channel-slug-suggest";

describe("slugifyLabel", () => {
  it("kebab-cases a plain label", () => {
    expect(slugifyLabel("Summoner Skirmish")).toBe("summoner-skirmish");
  });

  it("collapses punctuation and trims stray dashes", () => {
    expect(slugifyLabel("  Nexus Night — Piltover!  ")).toBe("nexus-night-piltover");
  });

  it("reads a month and year as a sortable period", () => {
    expect(slugifyLabel("October 2026")).toBe("2026-10");
    expect(slugifyLabel("january 2027")).toBe("2027-01");
  });

  it("leaves a label that only looks like a month alone", () => {
    expect(slugifyLabel("Octobre 2026")).toBe("octobre-2026");
  });

  it("is empty for an empty label", () => {
    expect(slugifyLabel("   ")).toBe("");
  });
});

describe("commonSlugPrefix", () => {
  it("is empty with no siblings", () => {
    expect(commonSlugPrefix([])).toBe("");
  });

  it("takes the segments every sibling shares", () => {
    expect(commonSlugPrefix(["piltover-2026-09", "piltover-2026-10"])).toBe("piltover-2026");
  });

  it("stops at the first differing segment", () => {
    expect(commonSlugPrefix(["piltover-2026-09", "zaun-2026-09"])).toBe("");
  });

  it("stops short of a sibling that is entirely the prefix", () => {
    expect(commonSlugPrefix(["piltover", "piltover-2026-10"])).toBe("");
  });

  it("uses the whole slug when there is only one sibling with more segments", () => {
    expect(commonSlugPrefix(["piltover-2026-09"])).toBe("piltover-2026");
  });
});

describe("suggestChannelSlug", () => {
  it("follows the siblings' pattern", () => {
    expect(
      suggestChannelSlug({
        parentSlug: "nexus-night",
        siblingSlugs: ["city-2026-08", "city-2026-09"],
        label: "October 2026",
      }),
    ).toBe("city-2026-10");
  });

  it("falls back to the parent slug when there are no siblings", () => {
    expect(
      suggestChannelSlug({
        parentSlug: "nexus-night",
        siblingSlugs: [],
        label: "October 2026",
      }),
    ).toBe("nexus-night-2026-10");
  });

  it("does not repeat a prefix the label already carries", () => {
    expect(
      suggestChannelSlug({
        parentSlug: "nexus-night",
        siblingSlugs: [],
        label: "Nexus Night Piltover",
      }),
    ).toBe("nexus-night-piltover");
  });

  it("is empty for an empty label", () => {
    expect(suggestChannelSlug({ parentSlug: "nexus-night", siblingSlugs: [], label: "" })).toBe("");
  });

  it("uses the label alone when there is no parent and no siblings", () => {
    expect(suggestChannelSlug({ parentSlug: "", siblingSlugs: [], label: "Prize Wall" })).toBe(
      "prize-wall",
    );
  });

  it("drops the prefix's own year so a period is not written twice", () => {
    expect(
      suggestChannelSlug({
        parentSlug: "nexus-night",
        siblingSlugs: ["city-2026-08", "city-2026-09"],
        label: "November 2026",
      }),
    ).toBe("city-2026-11");
  });

  it("keeps a numeric segment when the label is not a period", () => {
    expect(
      suggestChannelSlug({
        parentSlug: "worlds",
        siblingSlugs: ["worlds-2026-day-one", "worlds-2026-day-two"],
        label: "Day Three",
      }),
    ).toBe("worlds-2026-day-three");
  });
});
