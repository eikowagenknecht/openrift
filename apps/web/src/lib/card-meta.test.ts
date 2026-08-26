import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { CardMarketplaceOffer } from "./card-meta";
import {
  buildCardMetaDescription,
  buildCardPriceLine,
  frontImageId,
  getCardFrontImageFullUrl,
  pickCardMetaPrinting,
  resolveCardMetaPrinting,
} from "./card-meta";

const baseCard: CardDetailResponse["card"] = {
  id: "card-1",
  slug: "brazen-buccaneer",
  name: "Brazen Buccaneer",
  type: "unit",
  types: ["unit"],
  superTypes: [],
  domains: ["fury"],
  tokenCardIds: [],
  energy: 3,
  might: 4,
  power: 0,
  mightBonus: null,
  maxCopiesOverride: null,
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
    rarity: "rare",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "",
    publicCode: "OGN-202/298",
    printedRulesText: rulesText,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
  };
}

const labels = {
  domains: { fury: "Fury", calm: "Calm" },
  cardTypes: { unit: "Unit", legend: "Legend", gear: "Gear" },
};

describe("buildCardMetaDescription", () => {
  it("uses the card name, domains and type when no rules text is present", () => {
    expect(buildCardMetaDescription(baseCard, makePrinting(null), labels)).toBe(
      "Brazen Buccaneer is a Fury Unit card from Riftbound.",
    );
  });

  // ADR-037: a multi-type card must render every type in order, not just the
  // primary. Reading the scalar `type` would drop the "Gear" here.
  it("joins all types for a multi-type card", () => {
    const unitGear: CardDetailResponse["card"] = {
      ...baseCard,
      type: "unit",
      types: ["unit", "gear"],
    };
    expect(buildCardMetaDescription(unitGear, makePrinting(null), labels)).toBe(
      "Brazen Buccaneer is a Fury Unit Gear card from Riftbound.",
    );
  });

  it("strips :emoji_shortcodes: from rules text", () => {
    const result = buildCardMetaDescription(
      baseCard,
      makePrinting("Costs :rb_energy_2: less."),
      labels,
    );
    expect(result).not.toContain(":rb_energy_2:");
    expect(result).toContain("Costs less.");
  });

  it("strips [keyword:foo] markup from rules text", () => {
    const result = buildCardMetaDescription(
      baseCard,
      makePrinting("[Equip] this to a unit."),
      labels,
    );
    expect(result).not.toContain("[Equip]");
    expect(result).toContain("this to a unit.");
  });

  it("collapses runs of whitespace left behind by stripping", () => {
    const result = buildCardMetaDescription(
      baseCard,
      makePrinting("[Equip]  :rb_energy_1:  ready."),
      labels,
    );
    expect(result).not.toMatch(/ {2}/u);
  });

  it("truncates with ellipsis when over the description budget", () => {
    const long = "a ".repeat(200);
    const result = buildCardMetaDescription(baseCard, makePrinting(long), labels);
    expect(result.length).toBeLessThanOrEqual(155);
    expect(result.endsWith("...")).toBe(true);
  });

  it("inserts the price line between the type sentence and the rules text", () => {
    const offers: CardMarketplaceOffer[] = [
      { seller: "TCGplayer", currency: "USD", priceLow: 3.42, priceHigh: 5.1, offerCount: 2 },
    ];
    const result = buildCardMetaDescription(
      baseCard,
      makePrinting("Deal 2 damage."),
      labels,
      offers,
    );
    expect(result).toBe(
      "Brazen Buccaneer is a Fury Unit card from Riftbound. Prices from $3.42 (TCGplayer). Deal 2 damage.",
    );
  });

  it("omits the price line when there are no offers", () => {
    const result = buildCardMetaDescription(baseCard, makePrinting(null), labels, []);
    expect(result).toBe("Brazen Buccaneer is a Fury Unit card from Riftbound.");
  });

  it("omits the rules-text segment entirely when it strips down to nothing", () => {
    const result = buildCardMetaDescription(baseCard, makePrinting(":rb_energy_2:"), labels);
    expect(result).toBe("Brazen Buccaneer is a Fury Unit card from Riftbound.");
  });
});

describe("buildCardPriceLine", () => {
  it("formats the first offer's low price in its currency", () => {
    const offers: CardMarketplaceOffer[] = [
      { seller: "TCGplayer", currency: "USD", priceLow: 3.42, priceHigh: 5.1, offerCount: 2 },
      { seller: "Cardmarket", currency: "EUR", priceLow: 2.95, priceHigh: 4, offerCount: 3 },
    ];
    expect(buildCardPriceLine(offers)).toBe("Prices from $3.42 (TCGplayer).");
  });

  it("formats EUR marketplaces with the EUR shape", () => {
    const offers: CardMarketplaceOffer[] = [
      { seller: "Cardmarket", currency: "EUR", priceLow: 2.95, priceHigh: 4, offerCount: 3 },
    ];
    expect(buildCardPriceLine(offers)).toBe("Prices from 2,95 € (Cardmarket).");
  });

  it("returns null with no offers", () => {
    expect(buildCardPriceLine([])).toBeNull();
  });
});

describe("frontImageId", () => {
  it("returns the front face's image id, skipping other faces", () => {
    const printing: CatalogPrintingResponse = {
      ...makePrinting(null),
      images: [
        { face: "back", imageId: "back-id" },
        { face: "front", imageId: "front-id" },
      ],
    };
    expect(frontImageId(printing)).toBe("front-id");
  });

  it("returns null when the printing has no front image", () => {
    expect(frontImageId(makePrinting(null))).toBeNull();
  });

  it("returns null for a missing printing", () => {
    expect(frontImageId(undefined)).toBeNull();
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

describe("resolveCardMetaPrinting", () => {
  const LANG_ORDER = ["EN", "DE", "JA"] as const;
  // The EN printing is what `pickCardMetaPrinting` prefers, so the fallback is
  // distinguishable from a pinned non-EN variant.
  const en: CatalogPrintingResponse = { ...makePrinting("EN text"), id: "p-en", language: "EN" };
  const ja: CatalogPrintingResponse = { ...makePrinting("JA text"), id: "p-ja", language: "JA" };

  it("returns the pinned printing when printingId matches one on the card", () => {
    // Pin the JA variant even though EN is the language-preferred fallback.
    expect(resolveCardMetaPrinting([en, ja], "p-ja", LANG_ORDER)?.id).toBe("p-ja");
  });

  it("falls back to the preferred printing when printingId is undefined", () => {
    expect(resolveCardMetaPrinting([ja, en], undefined, LANG_ORDER)?.id).toBe("p-en");
  });

  it("falls back to the preferred printing when printingId matches nothing", () => {
    expect(resolveCardMetaPrinting([ja, en], "does-not-exist", LANG_ORDER)?.id).toBe("p-en");
  });

  it("returns undefined when there are no printings", () => {
    expect(resolveCardMetaPrinting([], "p-ja", LANG_ORDER)).toBeUndefined();
  });
});
