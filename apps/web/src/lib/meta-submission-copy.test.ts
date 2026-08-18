import { describe, expect, it } from "vitest";

import { metaCreditPreview, metaSubmissionExplanation } from "./meta-submission-copy";

describe("metaCreditPreview", () => {
  it("prints nothing while credit is off", () => {
    expect(metaCreditPreview("hidden", { name: "Riven Fan", riotId: "rivenfan#EUW" })).toEqual({
      creditedAs: null,
      usesDisplayNameFallback: false,
    });
  });

  it("prints the display name when the display name was chosen", () => {
    expect(metaCreditPreview("name", { name: "Riven Fan", riotId: "rivenfan#EUW" })).toEqual({
      creditedAs: "Riven Fan",
      usesDisplayNameFallback: false,
    });
  });

  it("prints the Riot ID when one is set", () => {
    expect(metaCreditPreview("riot_id", { name: "Riven Fan", riotId: "rivenfan#EUW" })).toEqual({
      creditedAs: "rivenfan#EUW",
      usesDisplayNameFallback: false,
    });
  });

  it("falls back to the display name when the Riot ID is unset", () => {
    expect(metaCreditPreview("riot_id", { name: "Riven Fan", riotId: null })).toEqual({
      creditedAs: "Riven Fan",
      usesDisplayNameFallback: true,
    });
  });

  it("treats a blank Riot ID the same as an unset one", () => {
    expect(metaCreditPreview("riot_id", { name: "Riven Fan", riotId: "   " })).toEqual({
      creditedAs: "Riven Fan",
      usesDisplayNameFallback: true,
    });
  });

  it("credits nobody when the chosen field and its fallback are both empty", () => {
    expect(metaCreditPreview("riot_id", { name: "", riotId: "" })).toEqual({
      creditedAs: null,
      usesDisplayNameFallback: true,
    });
    expect(metaCreditPreview("name", { name: undefined, riotId: "rivenfan#EUW" })).toEqual({
      creditedAs: null,
      usesDisplayNameFallback: false,
    });
  });
});

describe("metaSubmissionExplanation", () => {
  it("prefers the reviewer's own words", () => {
    expect(metaSubmissionExplanation("duplicate", "Beat you to it by an hour.")).toBe(
      "Beat you to it by an hour.",
    );
  });

  it("falls back to the canned sentence for the reason", () => {
    expect(metaSubmissionExplanation("not_an_event", null)).toBe(
      "We could not find a tournament behind this.",
    );
  });

  it("says nothing when there is no reason and no note", () => {
    expect(metaSubmissionExplanation(null, null)).toBeNull();
  });
});
