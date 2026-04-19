import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { EnumLabels } from "@/hooks/use-enums";

import {
  formatCardId,
  formatCardIdCompact,
  formatPrice,
  formatPriceCompact,
  formatPriceEur,
  formatPriceIntegerForMarketplace,
  formatPriceRange,
  formatPrintingLabel,
  formatPublicCode,
  priceColorClass,
} from "./format";

const TEST_LABELS: EnumLabels = {
  finishes: { normal: "Normal", foil: "Foil" },
  rarities: {},
  domains: {},
  cardTypes: {},
  superTypes: {},
  artVariants: { normal: "Normal", altart: "Alt Art", overnumbered: "Overnumbered" },
};

function stub(overrides: Partial<Printing> = {}): Printing {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000001",
    shortCode: "OGS-001",
    setId: "",
    setSlug: "",
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [],
    artist: "",
    publicCode: "ABCD",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    comment: null,
    language: "EN",
    card: {
      slug: "OGS-001",
      name: "",
      type: "Unit",
      superTypes: [],
      domains: [],
      energy: 0,
      might: 0,
      power: 0,
      keywords: [],
      tags: [],
      mightBonus: 0,
      errata: null,
      bans: [],
    },
    ...overrides,
  } satisfies Printing;
}

// ---------------------------------------------------------------------------
// formatCardId
// ---------------------------------------------------------------------------

describe("formatCardId", () => {
  it("returns the source id", () => {
    expect(formatCardId(stub({ shortCode: "OGS-042" }))).toBe("OGS-042");
  });
});

// ---------------------------------------------------------------------------
// formatCardIdCompact
// ---------------------------------------------------------------------------

describe("formatCardIdCompact", () => {
  it("returns suffix after last dash prefixed with #", () => {
    expect(formatCardIdCompact(stub({ shortCode: "OGS-042" }))).toBe("#042");
  });

  it("handles multi-dash ids (uses last dash)", () => {
    expect(formatCardIdCompact(stub({ shortCode: "SET-A-123" }))).toBe("#123");
  });

  it("returns full id with # when no dash present", () => {
    expect(formatCardIdCompact(stub({ shortCode: "NODASH" }))).toBe("#NODASH");
  });
});

// ---------------------------------------------------------------------------
// formatPublicCode
// ---------------------------------------------------------------------------

describe("formatPublicCode", () => {
  it("returns the public code", () => {
    expect(formatPublicCode(stub({ publicCode: "XYZ9" }))).toBe("XYZ9");
  });
});

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

describe("formatPrice", () => {
  it("formats a number with two decimal places", () => {
    expect(formatPrice(2.5)).toBe("$2.50");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it('returns "--" for null', () => {
    expect(formatPrice(null)).toBe("--");
  });

  it('returns "--" for undefined', () => {
    expect(formatPrice()).toBe("--");
  });
});

// ---------------------------------------------------------------------------
// priceColorClass
// ---------------------------------------------------------------------------

describe("priceColorClass", () => {
  it("returns muted for null", () => {
    expect(priceColorClass(null)).toBe("text-muted-foreground");
  });

  it("returns muted for undefined", () => {
    expect(priceColorClass()).toBe("text-muted-foreground");
  });

  it("returns muted for values < 1", () => {
    expect(priceColorClass(0.5)).toBe("text-muted-foreground");
    expect(priceColorClass(0)).toBe("text-muted-foreground");
  });

  it("returns emerald for 1 <= value < 10", () => {
    expect(priceColorClass(1)).toContain("emerald");
    expect(priceColorClass(9.99)).toContain("emerald");
  });

  it("returns amber for 10 <= value < 50", () => {
    expect(priceColorClass(10)).toContain("amber");
    expect(priceColorClass(49.99)).toContain("amber");
  });

  it("returns rose for value >= 50", () => {
    expect(priceColorClass(50)).toContain("rose");
    expect(priceColorClass(100)).toContain("rose");
  });
});

// ---------------------------------------------------------------------------
// formatPriceCompact
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// formatPriceRange
// ---------------------------------------------------------------------------

describe("formatPriceRange", () => {
  it("returns single value when min equals max", () => {
    expect(formatPriceRange(2.5, 2.5)).toBe("$2.50");
  });

  it("returns range with en dash for different values", () => {
    expect(formatPriceRange(1.5, 9.99)).toBe("$1.50\u2009\u2013\u2009$9.99");
  });

  it("handles different tiers", () => {
    expect(formatPriceRange(0.5, 42)).toBe("$0.50\u2009\u2013\u2009$42");
  });

  it("handles k-tier ranges", () => {
    expect(formatPriceRange(1000, 5000)).toBe("$1.0k\u2009\u2013\u2009$5.0k");
  });
});

// ---------------------------------------------------------------------------
// formatPriceCompact
// ---------------------------------------------------------------------------

describe("formatPriceCompact", () => {
  it('returns "--" for null', () => {
    expect(formatPriceCompact(null)).toBe("--");
  });

  it('returns "--" for undefined', () => {
    expect(formatPriceCompact()).toBe("--");
  });

  it("shows full cents for values < 10", () => {
    expect(formatPriceCompact(0)).toBe("$0.00");
    expect(formatPriceCompact(1.5)).toBe("$1.50");
    expect(formatPriceCompact(9.99)).toBe("$9.99");
  });

  it("rounds to integer for 10–999", () => {
    expect(formatPriceCompact(10)).toBe("$10");
    expect(formatPriceCompact(42.7)).toBe("$43");
    expect(formatPriceCompact(999)).toBe("$999");
  });

  it("uses k-tier with one decimal for 1000–9499", () => {
    expect(formatPriceCompact(999.5)).toBe("$1.0k");
    expect(formatPriceCompact(1000)).toBe("$1.0k");
    expect(formatPriceCompact(2500)).toBe("$2.5k");
    expect(formatPriceCompact(9499)).toBe("$9.5k");
  });

  it("rounds to integer k when one decimal would exceed 4 chars", () => {
    expect(formatPriceCompact(9999)).toBe("$10k");
    expect(formatPriceCompact(10_000)).toBe("$10k");
    expect(formatPriceCompact(25_000)).toBe("$25k");
  });
});

// ---------------------------------------------------------------------------
// formatPrintingLabel
// ---------------------------------------------------------------------------

describe("formatPrintingLabel", () => {
  it("shows non-normal attributes when no siblings provided", () => {
    const p = stub({
      artVariant: "altart",
      finish: "foil",
      isSigned: true,
      markers: [{ id: "1", slug: "promo", label: "Promo", description: null }],
    });
    expect(formatPrintingLabel(p, undefined, TEST_LABELS)).toBe("Alt Art · Foil · Signed · Promo");
  });

  it('returns "Standard" when all attributes are normal defaults', () => {
    expect(formatPrintingLabel(stub(), undefined, TEST_LABELS)).toBe("Standard");
  });

  it("falls back to the slug when a finish is missing from the labels map", () => {
    const p = stub({ finish: "metal" as Printing["finish"] });
    expect(formatPrintingLabel(p, undefined, TEST_LABELS)).toBe("metal");
  });

  it("uses the label map for custom finish slugs", () => {
    const p = stub({ finish: "metal" as Printing["finish"] });
    const labels: EnumLabels = {
      ...TEST_LABELS,
      finishes: { ...TEST_LABELS.finishes, metal: "Metal" },
    };
    expect(formatPrintingLabel(p, undefined, labels)).toBe("Metal");
  });

  it("omits attributes shared by all siblings", () => {
    const base = { finish: "foil" as const };
    const p = stub({ ...base, artVariant: "altart" });
    const siblings = [p, stub({ ...base, artVariant: "normal" })];
    expect(formatPrintingLabel(p, siblings, TEST_LABELS)).toBe("Alt Art");
  });

  it("includes attributes that differ among siblings", () => {
    const markers = [{ id: "1", slug: "promo", label: "Promo", description: null }];
    const p = stub({ isSigned: true, markers });
    const siblings = [p, stub({ isSigned: false, markers })];
    expect(formatPrintingLabel(p, siblings, TEST_LABELS)).toBe("Signed");
  });

  it("joins multiple distinguishing attributes with ·", () => {
    const p = stub({ artVariant: "altart", isSigned: true });
    const siblings = [p, stub()];
    expect(formatPrintingLabel(p, siblings, TEST_LABELS)).toBe("Alt Art · Signed");
  });

  it("tags every row with [XX] when language varies, including English", () => {
    const en = stub({ language: "EN" });
    const zh = stub({ language: "ZH" });
    const siblings = [en, zh];
    expect(formatPrintingLabel(en, siblings, TEST_LABELS)).toBe("[EN]");
    expect(formatPrintingLabel(zh, siblings, TEST_LABELS)).toBe("[ZH]");
  });

  it("puts the language tag before other distinguishing attributes", () => {
    const p = stub({ language: "ZH", artVariant: "altart", isSigned: true });
    const siblings = [p, stub({ language: "EN" })];
    expect(formatPrintingLabel(p, siblings, TEST_LABELS)).toBe("[ZH] · Alt Art · Signed");
  });

  it("omits the language tag when every sibling shares the language", () => {
    const p = stub({ language: "EN", artVariant: "altart" });
    const siblings = [p, stub({ language: "EN" })];
    expect(formatPrintingLabel(p, siblings, TEST_LABELS)).toBe("Alt Art");
  });

  it("omits the language tag when no siblings are provided", () => {
    expect(formatPrintingLabel(stub({ language: "ZH" }), undefined, TEST_LABELS)).toBe("Standard");
  });
});

// ---------------------------------------------------------------------------
// formatPriceEur
// ---------------------------------------------------------------------------

describe("formatPriceEur", () => {
  it('returns "--" for null', () => {
    expect(formatPriceEur(null)).toBe("--");
  });

  it('returns "--" for undefined', () => {
    expect(formatPriceEur()).toBe("--");
  });

  it("formats zero", () => {
    expect(formatPriceEur(0)).toBe("0,00 \u20AC");
  });

  it("formats a decimal value", () => {
    expect(formatPriceEur(9.99)).toBe("9,99 \u20AC");
  });

  it("uses comma as decimal separator", () => {
    expect(formatPriceEur(1.23)).toBe("1,23 \u20AC");
  });
});

// ---------------------------------------------------------------------------
// formatPriceIntegerForMarketplace
// ---------------------------------------------------------------------------

describe("formatPriceIntegerForMarketplace", () => {
  it("returns USD prefix for tcgplayer", () => {
    const fmt = formatPriceIntegerForMarketplace("tcgplayer");
    expect(fmt(0)).toBe("$0");
    expect(fmt(5)).toBe("$5");
    expect(fmt(1000)).toBe("$1000");
  });

  it("returns EUR suffix for cardmarket", () => {
    const fmt = formatPriceIntegerForMarketplace("cardmarket");
    expect(fmt(0)).toBe("0 \u20AC");
    expect(fmt(5)).toBe("5 \u20AC");
    expect(fmt(1000)).toBe("1000 \u20AC");
  });

  it("returns EUR suffix for cardtrader", () => {
    const fmt = formatPriceIntegerForMarketplace("cardtrader");
    expect(fmt(42)).toBe("42 \u20AC");
  });
});
