import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildCardMetaDescription, getCardFrontImageFullUrl } from "./card-meta";

const baseCard: CardDetailResponse["card"] = {
  id: "card-1",
  slug: "brazen-buccaneer",
  name: "Brazen Buccaneer",
  type: "Unit",
  superTypes: [],
  domains: ["Fury"],
  energy: 3,
  might: 4,
  power: 0,
  mightBonus: null,
  keywords: [],
  tags: [],
  errata: null,
  bans: [],
};

function makePrinting(rulesText: string | null): CatalogPrintingResponse {
  return {
    id: "p-1",
    cardId: "card-1",
    setId: "set-1",
    shortCode: "OGN-202",
    rarity: "Rare",
    artVariant: "normal",
    isSigned: false,
    promoType: null,
    finish: "normal",
    images: [],
    artist: "",
    publicCode: "OGN-202/298",
    printedRulesText: rulesText,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    language: "EN",
  };
}

describe("buildCardMetaDescription", () => {
  it("uses the card name, domains and type when no rules text is present", () => {
    expect(buildCardMetaDescription(baseCard, [makePrinting(null)])).toBe(
      "Brazen Buccaneer is a Fury Unit card from Riftbound.",
    );
  });

  it("strips :emoji_shortcodes: from rules text", () => {
    const result = buildCardMetaDescription(baseCard, [makePrinting("Costs :rb_energy_2: less.")]);
    expect(result).not.toContain(":rb_energy_2:");
    expect(result).toContain("Costs less.");
  });

  it("strips [keyword:foo] markup from rules text", () => {
    const result = buildCardMetaDescription(baseCard, [makePrinting("[Equip] this to a unit.")]);
    expect(result).not.toContain("[Equip]");
    expect(result).toContain("this to a unit.");
  });

  it("collapses runs of whitespace left behind by stripping", () => {
    const result = buildCardMetaDescription(baseCard, [
      makePrinting("[Equip]  :rb_energy_1:  ready."),
    ]);
    expect(result).not.toMatch(/ {2}/);
  });

  it("truncates with ellipsis when over the description budget", () => {
    const long = "a ".repeat(200);
    const result = buildCardMetaDescription(baseCard, [makePrinting(long)]);
    expect(result.length).toBeLessThanOrEqual(155);
    expect(result.endsWith("...")).toBe(true);
  });

  it("omits the rules-text segment entirely when it strips down to nothing", () => {
    const result = buildCardMetaDescription(baseCard, [makePrinting(":rb_energy_2:")]);
    expect(result).toBe("Brazen Buccaneer is a Fury Unit card from Riftbound.");
  });
});

describe("getCardFrontImageFullUrl", () => {
  it("returns the front image full URL of the first printing that has one", () => {
    const printingWithoutImages = makePrinting(null);
    const printingWithImages: CatalogPrintingResponse = {
      ...makePrinting(null),
      id: "p-2",
      images: [
        { face: "back", full: "back-full.webp", thumbnail: "back-400w.webp" },
        { face: "front", full: "front-full.webp", thumbnail: "front-400w.webp" },
      ],
    };
    expect(getCardFrontImageFullUrl([printingWithoutImages, printingWithImages])).toBe(
      "front-full.webp",
    );
  });

  it("returns undefined when no printing has a front image", () => {
    expect(getCardFrontImageFullUrl([makePrinting(null)])).toBeUndefined();
  });
});
