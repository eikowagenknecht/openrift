import { describe, expect, it } from "vitest";

import type { ContributeFormState } from "./contribute-json";
import {
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
      type: "Unit",
      superTypes: ["Champion"],
      domains: ["Calm"],
      might: 4,
      energy: 5,
      power: 1,
      mightBonus: null,
      rulesText: "When I hold, you score 1 point.",
      effectText: null,
      tags: ["Ahri", "Ionia"],
      shortCode: "OGN-066",
    },
    printings: [
      {
        shortCode: "OGN-066",
        setId: "ogn",
        setName: "Origins",
        rarity: "Rare",
        artVariant: "normal",
        isSigned: false,
        markerSlugs: [],
        distributionChannelSlugs: [],
        finish: "foil",
        artist: "League Splash Team",
        publicCode: "OGN-066/298",
        printedRulesText: "When I hold, you score 1 point.",
        printedEffectText: null,
        imageUrl: "https://example.com/ogn-066.png",
        flavorText: "“Remember this moment.”",
        language: "en",
        printedName: null,
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
    expect(paths).toContain("printings[0].shortCode");
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

  it("rejects an invalid language code", () => {
    const state = fullState();
    state.printings[0].language = "EN";
    const result = validateContribution(state);
    expect(result.errors.find((e) => e.path === "printings[0].language")).toBeDefined();
  });

  it("accepts a 3-letter ISO 639-3 language code", () => {
    const state = fullState();
    state.printings[0].language = "zho";
    const result = validateContribution(state);
    expect(result.ok).toBe(true);
  });
});

describe("buildContributionJson", () => {
  it("produces snake_case keys and includes all set fields", () => {
    const json = buildContributionJson(fullState(), STAMP);
    expect(json.$schema).toBe("../card.schema.json");
    expect(json.card).toMatchObject({
      name: "Ahri, Alluring",
      type: "Unit",
      super_types: ["Champion"],
      domains: ["Calm"],
      might: 4,
      energy: 5,
      power: 1,
      rules_text: "When I hold, you score 1 point.",
      tags: ["Ahri", "Ionia"],
      short_code: "OGN-066",
    });
    expect(json.printings[0]).toMatchObject({
      short_code: "OGN-066",
      set_id: "ogn",
      set_name: "Origins",
      rarity: "Rare",
      art_variant: "normal",
      finish: "foil",
      artist: "League Splash Team",
      public_code: "OGN-066/298",
      image_url: "https://example.com/ogn-066.png",
      language: "en",
    });
  });

  it("appends the date stamp to external IDs so check-uniqueness.mjs accepts the PR", () => {
    const json = buildContributionJson(fullState(), STAMP);
    expect(json.card.external_id).toBe(`community:ahri-alluring--${STAMP}`);
    expect(json.printings[0].external_id).toBe(`community:OGN-066--${STAMP}:foil:en`);
  });

  it("omits empty strings, nulls, and empty arrays", () => {
    const state = fullState();
    state.card.effectText = null;
    state.card.tags = [];
    state.printings[0].markerSlugs = [];
    state.printings[0].printedEffectText = null;
    const json = buildContributionJson(state, STAMP);
    expect(json.card).not.toHaveProperty("effect_text");
    expect(json.card).not.toHaveProperty("tags");
    expect(json.printings[0]).not.toHaveProperty("marker_slugs");
    expect(json.printings[0]).not.toHaveProperty("printed_effect_text");
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
    state.card.rulesText = "  text  ";
    const json = buildContributionJson(state, STAMP);
    expect(json.card.name).toBe("Ahri");
    expect(json.card.rules_text).toBe("text");
  });
});

describe("buildContributionFilename", () => {
  it("places the file under contributions/ with the date suffix", () => {
    expect(buildContributionFilename("ahri-alluring", STAMP)).toBe(
      `contributions/ahri-alluring--${STAMP}.json`,
    );
  });
});

describe("buildGithubNewFileUrl", () => {
  it("targets openriftapp/openrift-data and encodes the JSON value", () => {
    const json = buildContributionJson(fullState(), STAMP);
    const url = buildGithubNewFileUrl(buildContributionFilename("ahri-alluring", STAMP), json);
    expect(url.startsWith("https://github.com/openriftapp/openrift-data/new/main?")).toBe(true);
    expect(url).toContain(`filename=contributions%2Fahri-alluring--${STAMP}.json`);
    const params = new URL(url).searchParams;
    const value = params.get("value") ?? "";
    expect(JSON.parse(value)).toMatchObject({ card: { name: "Ahri, Alluring" } });
  });
});
