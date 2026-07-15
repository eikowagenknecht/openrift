import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import type { ContributeFormState } from "./contribute-json";
import {
  buildContributionJson,
  buildImagePatchState,
  buildSubmissionPayload,
  emptyFormState,
  formatDateStamp,
  nameToSlug,
  validateContribution,
} from "./contribute-json";

const STAMP = "20260501-1200";

function fullState(): ContributeFormState {
  return {
    slug: "ahri-alluring",
    card: {
      name: "Ahri, Alluring",
      types: ["unit"],
      superTypes: ["champion"],
      domains: ["calm"],
      might: 4,
      energy: 5,
      power: 1,
      mightBonus: null,
      tags: ["Ahri", "Ionia"],
    },
    printings: [
      {
        setId: "ogn",
        setName: "Origins",
        rarity: "rare",
        artVariant: "normal",
        isSigned: false,
        markerSlugs: [],
        distributionChannelSlugs: [],
        finish: "foil",
        size: "standard",
        artist: "League Splash Team",
        publicCode: "OGN-066/298",
        printedRulesText: "When I hold, you score 1 point.",
        printedEffectText: null,
        imageUrl: "https://example.com/ogn-066.png",
        flavorText: "“Remember this moment.”",
        language: "EN",
        printedName: "",
        printedYear: 2025,
      },
    ],
  };
}

describe("nameToSlug", () => {
  it("kebab-cases plain ASCII", () => {
    expect(nameToSlug("Ahri Alluring")).toBe("ahri-alluring");
  });

  it("collapses runs of whitespace and punctuation", () => {
    expect(nameToSlug("Ahri,  the   Nine-Tailed!")).toBe("ahri-the-nine-tailed");
  });

  it("strips diacritics", () => {
    expect(nameToSlug("Pénélope")).toBe("penelope");
  });

  it("trims leading and trailing dashes", () => {
    expect(nameToSlug("---  hello  ---")).toBe("hello");
  });
});

describe("formatDateStamp", () => {
  it("formats a date as YYYYMMDD-HHmm in UTC", () => {
    const date = new Date(Date.UTC(2026, 4, 1, 12, 34));
    expect(formatDateStamp(date)).toBe("20260501-1234");
  });

  it("zero-pads single-digit components", () => {
    const date = new Date(Date.UTC(2026, 0, 5, 3, 7));
    expect(formatDateStamp(date)).toBe("20260105-0307");
  });
});

describe("validateContribution", () => {
  it("accepts a complete state", () => {
    const result = validateContribution(fullState());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects an empty state", () => {
    const result = validateContribution(emptyFormState());
    expect(result.ok).toBe(false);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain("slug");
    expect(paths).toContain("card.name");
  });

  it("rejects a slug with uppercase letters", () => {
    const state = fullState();
    state.slug = "Ahri-Alluring";
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "slug")).toBeDefined();
  });

  it("rejects a non-https image URL", () => {
    const state = fullState();
    state.printings[0].imageUrl = "http://example.com/img.png";
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].imageUrl")).toBeDefined();
  });

  it("rejects a lowercase language code", () => {
    const state = fullState();
    state.printings[0].language = "en";
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].language")).toBeDefined();
  });

  it("rejects a 3-letter language code", () => {
    const state = fullState();
    state.printings[0].language = "ENG";
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].language")).toBeDefined();
  });

  it("accepts a null printed year", () => {
    const state = fullState();
    state.printings[0].printedYear = null;
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].printedYear")).toBeUndefined();
  });

  it("rejects a printed year below 1900", () => {
    const state = fullState();
    state.printings[0].printedYear = 1899;
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].printedYear")).toBeDefined();
  });

  it("rejects a printed year above 2999", () => {
    const state = fullState();
    state.printings[0].printedYear = 3000;
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].printedYear")).toBeDefined();
  });

  it("rejects a printing without a public_code", () => {
    const state = fullState();
    state.printings[0].publicCode = null;
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].publicCode")).toBeDefined();
  });

  it("does not surface external_id errors when the slug is invalid", () => {
    const state = fullState();
    state.slug = "Not-A-Slug";
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "slug")).toBeDefined();
    expect(result.errors.find((e) => e.path === "card.external_id")).toBeUndefined();
  });
});

describe("buildContributionJson", () => {
  it("produces snake_case keys and includes all set fields", () => {
    const json = buildContributionJson(fullState(), STAMP);
    expect(json.card).toMatchObject({
      name: "Ahri, Alluring",
      types: ["unit"],
      super_types: ["champion"],
      domains: ["calm"],
      might: 4,
      energy: 5,
      power: 1,
      tags: ["Ahri", "Ionia"],
    });
    expect(json.printings[0]).toMatchObject({
      set_id: "ogn",
      set_name: "Origins",
      rarity: "rare",
      art_variant: "normal",
      finish: "foil",
      artist: "League Splash Team",
      public_code: "OGN-066/298",
      image_url: "https://example.com/ogn-066.png",
      language: "EN",
    });
  });

  it("appends the date stamp to external IDs so check-uniqueness.mjs accepts the PR", () => {
    const json = buildContributionJson(fullState(), STAMP);
    expect(json.card.external_id).toBe(`community:ahri-alluring--${STAMP}`);
    expect(json.printings[0].external_id).toBe(`community:ahri-alluring:OGN-066--${STAMP}:foil:en`);
  });

  it("falls back to the printing index when publicCode is missing", () => {
    const state = fullState();
    state.printings[0].publicCode = null;
    const json = buildContributionJson(state, STAMP);
    expect(json.printings[0].external_id).toBe(`community:ahri-alluring:0--${STAMP}:foil:en`);
  });

  it("omits empty strings, nulls, and empty arrays", () => {
    const state = fullState();
    state.card.tags = [];
    state.printings[0].markerSlugs = [];
    state.printings[0].printedEffectText = null;
    state.printings[0].printedYear = null;
    const json = buildContributionJson(state, STAMP);
    expect(json.card).not.toHaveProperty("tags");
    expect(json.printings[0]).not.toHaveProperty("marker_slugs");
    expect(json.printings[0]).not.toHaveProperty("printed_effect_text");
    expect(json.printings[0]).not.toHaveProperty("printed_year");
  });

  it("emits printed_year as an integer when set", () => {
    const state = fullState();
    state.printings[0].printedYear = 2025;
    const json = buildContributionJson(state, STAMP);
    expect(json.printings[0].printed_year).toBe(2025);
  });

  it("falls back to the card name when printedName is blank", () => {
    const state = fullState();
    state.printings[0].printedName = "";
    const json = buildContributionJson(state, STAMP);
    expect(json.printings[0].printed_name).toBe("Ahri, Alluring");
  });

  it("uses the printing's own printed name when set, even if equal to the card name", () => {
    const state = fullState();
    state.printings[0].printedName = "Ahri, Alluring";
    const json = buildContributionJson(state, STAMP);
    expect(json.printings[0].printed_name).toBe("Ahri, Alluring");
  });

  it("preserves a printing-specific printed name distinct from the card name", () => {
    const state = fullState();
    state.printings[0].printedName = "Ahri, séduisante";
    const json = buildContributionJson(state, STAMP);
    expect(json.printings[0].printed_name).toBe("Ahri, séduisante");
  });

  it("only emits is_signed when true", () => {
    const state = fullState();
    state.printings[0].isSigned = false;
    let json = buildContributionJson(state, STAMP);
    expect(json.printings[0]).not.toHaveProperty("is_signed");
    state.printings[0].isSigned = true;
    json = buildContributionJson(state, STAMP);
    expect(json.printings[0].is_signed).toBe(true);
  });

  it("trims whitespace from string fields", () => {
    const state = fullState();
    state.card.name = "  Ahri  ";
    state.printings[0].printedRulesText = "  text  ";
    const json = buildContributionJson(state, STAMP);
    expect(json.card.name).toBe("Ahri");
    expect(json.printings[0].printed_rules_text).toBe("text");
  });
});

describe("buildSubmissionPayload", () => {
  it("carries the slug and snake_case card fields without an external_id", () => {
    const payload = buildSubmissionPayload(fullState(), null);
    expect(payload.slug).toBe("ahri-alluring");
    expect(payload.card).toMatchObject({
      name: "Ahri, Alluring",
      types: ["unit"],
      super_types: ["champion"],
      domains: ["calm"],
      might: 4,
    });
    expect(payload.card).not.toHaveProperty("external_id");
  });

  it("emits at least one printing, each without an external_id", () => {
    const payload = buildSubmissionPayload(fullState(), null);
    expect(payload.printings.length).toBeGreaterThan(0);
    for (const printing of payload.printings) {
      expect(printing).not.toHaveProperty("external_id");
      expect(printing).toHaveProperty("public_code");
    }
  });

  it("trims the note and turns a blank note into null", () => {
    expect(buildSubmissionPayload(fullState(), "  spotted in OGN  ").submissionNote).toBe(
      "spotted in OGN",
    );
    expect(buildSubmissionPayload(fullState(), "   ").submissionNote).toBeNull();
    expect(buildSubmissionPayload(fullState(), null).submissionNote).toBeNull();
  });
});

describe("buildImagePatchState", () => {
  it("only fills the fields needed to identify the printing plus the image URL", () => {
    const printing = stubPrinting({
      publicCode: "OGN-066/298",
      finish: "foil",
      language: "EN",
      printedName: "Ahri, Alluring",
    });
    const state = buildImagePatchState({
      cardName: "Ahri, Alluring",
      cardSlug: "ahri-alluring",
      printing,
      setSlug: "ogn",
      setName: "Origins",
      imageUrl: "https://example.com/ogn-066.png",
    });
    expect(state.slug).toBe("ahri-alluring");
    expect(state.card.name).toBe("Ahri, Alluring");
    expect(state.card.domains).toEqual([]);
    expect(state.card.might).toBeNull();
    expect(state.printings).toHaveLength(1);
    expect(state.printings[0]).toMatchObject({
      setId: "ogn",
      setName: "Origins",
      finish: "foil",
      publicCode: "OGN-066/298",
      imageUrl: "https://example.com/ogn-066.png",
      language: "EN",
      printedName: "Ahri, Alluring",
    });
  });

  it("produces JSON that omits everything but the identifying fields and the image URL", () => {
    const printing = stubPrinting({
      publicCode: "OGN-066/298",
      finish: "foil",
      language: "EN",
      printedName: "Ahri, Alluring",
    });
    const state = buildImagePatchState({
      cardName: "Ahri, Alluring",
      cardSlug: "ahri-alluring",
      printing,
      setSlug: "ogn",
      setName: "Origins",
      imageUrl: "https://example.com/ogn-066.png",
    });
    const json = buildContributionJson(state, STAMP);
    expect(json.card).toEqual({
      name: "Ahri, Alluring",
      external_id: `community:ahri-alluring--${STAMP}`,
    });
    expect(json.printings[0]).toEqual({
      external_id: `community:ahri-alluring:OGN-066--${STAMP}:foil:en`,
      printed_name: "Ahri, Alluring",
      set_id: "ogn",
      set_name: "Origins",
      finish: "foil",
      public_code: "OGN-066/298",
      image_url: "https://example.com/ogn-066.png",
      language: "EN",
    });
  });

  it("validates as a complete contribution", () => {
    const printing = stubPrinting({ publicCode: "OGN-066/298" });
    const state = buildImagePatchState({
      cardName: "Ahri, Alluring",
      cardSlug: "ahri-alluring",
      printing,
      setSlug: "ogn",
      setName: "Origins",
      imageUrl: "https://example.com/ogn-066.png",
    });
    expect(validateContribution(state).ok).toBe(true);
  });

  it("omits image_url when the URL is empty (callers must guard on empty input)", () => {
    const printing = stubPrinting({ publicCode: "OGN-066/298" });
    const state = buildImagePatchState({
      cardName: "Ahri, Alluring",
      cardSlug: "ahri-alluring",
      printing,
      setSlug: "ogn",
      setName: "Origins",
      imageUrl: "",
    });
    const json = buildContributionJson(state, STAMP);
    expect(json.printings[0]).not.toHaveProperty("image_url");
  });

  it("rejects a non-https image URL", () => {
    const printing = stubPrinting({ publicCode: "OGN-066/298" });
    const state = buildImagePatchState({
      cardName: "Ahri, Alluring",
      cardSlug: "ahri-alluring",
      printing,
      setSlug: "ogn",
      setName: "Origins",
      imageUrl: "http://example.com/ogn-066.png",
    });
    const result = validateContribution(state);
    expect(result.ok).toBe(false);
    expect(result.errors.find((e) => e.path === "printings[0].imageUrl")).toBeDefined();
  });

  it("falls back to the card name when the printing has no printed name", () => {
    const printing = stubPrinting({
      publicCode: "OGN-066/298",
      finish: "foil",
      language: "EN",
      printedName: null,
    });
    const state = buildImagePatchState({
      cardName: "Ahri, Alluring",
      cardSlug: "ahri-alluring",
      printing,
      setSlug: "ogn",
      setName: "Origins",
      imageUrl: "https://example.com/ogn-066.png",
    });
    const json = buildContributionJson(state, STAMP);
    expect(json.printings[0].printed_name).toBe("Ahri, Alluring");
  });
});
