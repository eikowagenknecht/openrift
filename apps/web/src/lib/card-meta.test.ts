import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  buildCardMetaDescription,
  getCardFrontImageFullUrl,
  pickCardMetaPrinting,
} from "./card-meta";

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
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [],
    artist: "",
    publicCode: "OGN-202/298",
    printedRulesText: rulesText,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
  };
}

describe("buildCardMetaDescription", () => {
  it("uses the card name, domains and type when no rules text is present", () => {
    expect(buildCardMetaDescription(baseCard, makePrinting(null))).toBe(
      "Brazen Buccaneer is a Fury Unit card from Riftbound.",
    );
  });

  it("strips :emoji_shortcodes: from rules text", () => {
    const result = buildCardMetaDescription(baseCard, makePrinting("Costs :rb_energy_2: less."));
    expect(result).not.toContain(":rb_energy_2:");
    expect(result).toContain("Costs less.");
  });

  it("strips [keyword:foo] markup from rules text", () => {
    const result = buildCardMetaDescription(baseCard, makePrinting("[Equip] this to a unit."));
    expect(result).not.toContain("[Equip]");
    expect(result).toContain("this to a unit.");
  });

  it("collapses runs of whitespace left behind by stripping", () => {
    const result = buildCardMetaDescription(
      baseCard,
      makePrinting("[Equip]  :rb_energy_1:  ready."),
    );
    expect(result).not.toMatch(/ {2}/);
  });

  it("truncates with ellipsis when over the description budget", () => {
    const long = "a ".repeat(200);
    const result = buildCardMetaDescription(baseCard, makePrinting(long));
    expect(result.length).toBeLessThanOrEqual(155);
    expect(result.endsWith("...")).toBe(true);
  });

  it("omits the rules-text segment entirely when it strips down to nothing", () => {
    const result = buildCardMetaDescription(baseCard, makePrinting(":rb_energy_2:"));
    expect(result).toBe("Brazen Buccaneer is a Fury Unit card from Riftbound.");
  });
});

describe("getCardFrontImageFullUrl", () => {
  it("returns the front image full URL when the printing has one", () => {
    const printingWithImages: CatalogPrintingResponse = {
      ...makePrinting(null),
      id: "p-2",
      images: [
        { face: "back", imageId: "019d6c25-b081-74b3-a901-64da4ae0bbbb" },
        { face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae0aaaa" },
      ],
    };
    expect(getCardFrontImageFullUrl(printingWithImages)).toBe(
      "/media/cards/aa/019d6c25-b081-74b3-a901-64da4ae0aaaa-full.webp",
    );
  });

  it("returns undefined when the printing has no front image", () => {
    expect(getCardFrontImageFullUrl(makePrinting(null))).toBeUndefined();
  });

  it("returns undefined when no printing is given", () => {
    expect(getCardFrontImageFullUrl(undefined)).toBeUndefined();
  });
});

describe("pickCardMetaPrinting", () => {
  const LANG_ORDER = ["EN", "DE", "JA"] as const;

  it("returns undefined when there are no printings", () => {
    expect(pickCardMetaPrinting([], LANG_ORDER)).toBeUndefined();
  });

  // Regression: head() used to use `printings[0]` directly, so if the API
  // returned a non-EN printing first, crawlers got its metadata (rules text,
  // og:image) while the in-page UI showed the EN printing via
  // `preferredPrinting(..., ["EN"])`. This test fails without the
  // `preferredPrinting` call in `pickCardMetaPrinting`.
  it("prefers the EN printing even when printings[0] is in another language", () => {
    const ja: CatalogPrintingResponse = { ...makePrinting("JA text"), id: "p-ja", language: "JA" };
    const en: CatalogPrintingResponse = { ...makePrinting("EN text"), id: "p-en", language: "EN" };
    expect(pickCardMetaPrinting([ja, en], LANG_ORDER)?.id).toBe("p-en");
  });

  it("falls back to the first printing when none match the preferred language", () => {
    const ja: CatalogPrintingResponse = { ...makePrinting(null), id: "p-ja", language: "JA" };
    const de: CatalogPrintingResponse = { ...makePrinting(null), id: "p-de", language: "DE" };
    const picked = pickCardMetaPrinting([ja, de], ["EN"]);
    expect(picked).toBeDefined();
    expect([ja.id, de.id]).toContain(picked?.id);
  });
});
