import { describe, expect, it } from "vitest";

import type { ContributeFormState } from "./contribute-json";
import {
  buildCommitMessage,
  buildContributionFilename,
  buildContributionJson,
  buildGithubNewFileUrl,
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
      type: "unit",
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
        finish: "foil",
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
});

describe("buildContributionJson", () => {
  it("produces snake_case keys and includes all set fields", () => {
    const json = buildContributionJson(fullState(), STAMP);
    expect(json.$schema).toBe("../../schemas/card.schema.json");
    expect(json.card).toMatchObject({
      name: "Ahri, Alluring",
      type: "unit",
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

describe("buildContributionFilename", () => {
  it("places the file under data/cards/ with the date suffix", () => {
    expect(buildContributionFilename("ahri-alluring", STAMP)).toBe(
      `data/cards/ahri-alluring--${STAMP}.json`,
    );
  });
});

describe("buildCommitMessage", () => {
  it("uses 'feat: add' for a new contribution", () => {
    expect(buildCommitMessage("Ahri, Alluring", false)).toBe("feat: add Ahri, Alluring");
  });

  it("uses 'fix: update' for a correction", () => {
    expect(buildCommitMessage("Ahri, Alluring", true)).toBe("fix: update Ahri, Alluring");
  });

  it("trims surrounding whitespace from the card name", () => {
    expect(buildCommitMessage("  Ahri  ", false)).toBe("feat: add Ahri");
  });

  it("falls back to a generic name when the card name is blank", () => {
    expect(buildCommitMessage("", false)).toBe("feat: add card");
    expect(buildCommitMessage("   ", true)).toBe("fix: update card");
  });
});

describe("buildGithubNewFileUrl", () => {
  it("targets openriftapp/openrift-data and encodes the JSON value", () => {
    const json = buildContributionJson(fullState(), STAMP);
    const url = buildGithubNewFileUrl(
      buildContributionFilename("ahri-alluring", STAMP),
      json,
      "feat: add Ahri, Alluring",
    );
    expect(url.startsWith("https://github.com/openriftapp/openrift-data/new/main?")).toBe(true);
    expect(url).toContain(`filename=data%2Fcards%2Fahri-alluring--${STAMP}.json`);
    const params = new URL(url).searchParams;
    const value = params.get("value") ?? "";
    expect(JSON.parse(value)).toMatchObject({ card: { name: "Ahri, Alluring" } });
  });

  it("sets the commit subject via the message query param", () => {
    const json = buildContributionJson(fullState(), STAMP);
    const url = buildGithubNewFileUrl(
      buildContributionFilename("ahri-alluring", STAMP),
      json,
      "feat: add Ahri, Alluring",
    );
    const params = new URL(url).searchParams;
    expect(params.get("message")).toBe("feat: add Ahri, Alluring");
  });

  it("does not set a description param", () => {
    const json = buildContributionJson(fullState(), STAMP);
    const url = buildGithubNewFileUrl(
      buildContributionFilename("ahri-alluring", STAMP),
      json,
      "feat: add Ahri, Alluring",
    );
    const params = new URL(url).searchParams;
    expect(params.has("description")).toBe(false);
  });
});
