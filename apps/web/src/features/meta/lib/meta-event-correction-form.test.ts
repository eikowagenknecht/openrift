import { describe, expect, it } from "vitest";

import type { MetaEventCorrectionSubject } from "./meta-event-correction-form";
import {
  metaEventCorrectionDraft,
  metaEventCorrectionEdits,
  validateMetaEventCorrectionDraft,
} from "./meta-event-correction-form";

const event: MetaEventCorrectionSubject = {
  name: "Summoner Skirmish Berlin",
  eventDate: "2026-08-15",
  format: "constructed",
  playerCount: 64,
  organizer: "Rift Games Berlin",
  location: "Ionia Hall, Berlin",
  country: "DE",
};

const sparse: MetaEventCorrectionSubject = {
  ...event,
  playerCount: null,
  organizer: null,
  location: null,
  country: null,
};

function draft(overrides: Partial<ReturnType<typeof metaEventCorrectionDraft>> = {}) {
  return { ...metaEventCorrectionDraft(event), note: "Saw the results page.", ...overrides };
}

describe("metaEventCorrectionDraft", () => {
  it("seeds every box with what the archive holds", () => {
    expect(metaEventCorrectionDraft(event)).toEqual({
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-15",
      format: "constructed",
      playerCount: "64",
      organizer: "Rift Games Berlin",
      location: "Ionia Hall, Berlin",
      country: "DE",
      note: "",
    });
  });

  it("leaves a fact the archive has none of blank rather than inventing one", () => {
    const seeded = metaEventCorrectionDraft(sparse);
    expect(seeded.playerCount).toBe("");
    expect(seeded.organizer).toBe("");
    expect(seeded.country).toBe("");
  });
});

describe("metaEventCorrectionEdits", () => {
  it("proposes nothing when every box still says what the archive says", () => {
    expect(metaEventCorrectionEdits(draft(), event)).toEqual({});
  });

  it("carries only the boxes that changed", () => {
    const edits = metaEventCorrectionEdits(draft({ playerCount: "48" }), event);
    expect(edits).toEqual({ playerCount: 48 });
  });

  it("reads an emptied box as leaving the value alone", () => {
    expect(metaEventCorrectionEdits(draft({ organizer: "", playerCount: "" }), event)).toEqual({});
  });

  it("normalises a country code to upper case", () => {
    expect(metaEventCorrectionEdits(draft({ country: "fr" }), event).country).toBe("FR");
  });

  it("fills in a fact the archive has none of", () => {
    const edits = metaEventCorrectionEdits(
      { ...metaEventCorrectionDraft(sparse), organizer: "Rift Games Berlin", note: "n" },
      sparse,
    );
    expect(edits).toEqual({ organizer: "Rift Games Berlin" });
  });

  it("ignores whitespace-only edits", () => {
    expect(metaEventCorrectionEdits(draft({ name: "   " }), event)).toEqual({});
  });
});

describe("validateMetaEventCorrectionDraft", () => {
  it("accepts a note with no edits, which is a message about the event", () => {
    expect(validateMetaEventCorrectionDraft(draft(), event)).toBeNull();
  });

  it("refuses a draft with nothing written in the note", () => {
    expect(validateMetaEventCorrectionDraft(draft({ note: "  " }), event)).toBe(
      "Tell us what's wrong, and where you saw the right version.",
    );
  });

  it("refuses a note past the bound the contract enforces", () => {
    expect(validateMetaEventCorrectionDraft(draft({ note: "a".repeat(2001) }), event)).toBe(
      "The note must be 2000 characters or fewer.",
    );
  });

  it("refuses a player count that is not a whole number of at least one", () => {
    expect(validateMetaEventCorrectionDraft(draft({ playerCount: "0" }), event)).toContain(
      "whole number",
    );
    expect(validateMetaEventCorrectionDraft(draft({ playerCount: "12.5" }), event)).toContain(
      "whole number",
    );
  });

  it("refuses a player count past the ceiling the contract enforces", () => {
    expect(validateMetaEventCorrectionDraft(draft({ playerCount: "1000001" }), event)).toContain(
      "more players than any tournament",
    );
    expect(validateMetaEventCorrectionDraft(draft({ playerCount: "1000000" }), event)).toBeNull();
  });

  it("refuses a country that is not a two-letter code", () => {
    expect(validateMetaEventCorrectionDraft(draft({ country: "Germany" }), event)).toContain(
      "two-letter code",
    );
  });

  it("refuses a name past the bound the contract enforces", () => {
    expect(validateMetaEventCorrectionDraft(draft({ name: "a".repeat(121) }), event)).toContain(
      "120 characters",
    );
  });

  it("refuses a date that is not a calendar day", () => {
    expect(validateMetaEventCorrectionDraft(draft({ eventDate: "August 2026" }), event)).toBe(
      "Pick the day the tournament was played.",
    );
  });
});
