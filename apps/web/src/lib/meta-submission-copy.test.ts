import { META_SUBMISSION_REASONS } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  metaCreditPreview,
  metaSubmissionCompletenessLabels,
  metaSubmissionExplanation,
  metaSubmissionFormTitles,
  metaSubmissionReasonSentences,
  metaSubmissionReasonsFor,
} from "./meta-submission-copy";

describe("metaSubmissionFormTitles", () => {
  it("names each of the three deck-submission kinds", () => {
    expect(metaSubmissionFormTitles).toEqual({
      new_list: "Add decklist",
      completion: "Complete decklist",
      correction: "Suggest a correction",
    });
  });
});

describe("metaSubmissionCompletenessLabels", () => {
  it("names the two list-completeness states a player sees", () => {
    expect(metaSubmissionCompletenessLabels).toEqual({
      full: "Whole deck",
      partial: "Main deck only",
    });
  });
});

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

describe("metaSubmissionReasonsFor", () => {
  it("offers every reason for a contribution that carries a decklist", () => {
    expect(metaSubmissionReasonsFor("new_list")).toEqual(META_SUBMISSION_REASONS);
    expect(metaSubmissionReasonsFor("completion")).toEqual(META_SUBMISSION_REASONS);
    expect(metaSubmissionReasonsFor("correction")).toEqual(META_SUBMISSION_REASONS);
  });

  it("drops the reasons that talk about a list from an event correction", () => {
    const reasons = metaSubmissionReasonsFor("event_correction");
    expect(reasons).not.toContain("incomplete_list");
    expect(reasons).not.toContain("duplicate");
    expect(reasons).toEqual(["already_correct", "unverified", "not_an_event"]);
  });

  it("has a sentence for every reason it offers", () => {
    for (const reason of metaSubmissionReasonsFor("event_correction")) {
      expect(metaSubmissionReasonSentences[reason]).toBeTruthy();
      expect(metaSubmissionReasonSentences[reason]).not.toContain("list");
    }
  });
});
