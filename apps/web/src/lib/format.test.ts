import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { EnumLabels } from "@/hooks/use-enums";

import {
  formatCardId,
  formatImportPrintingLabel,
  formatImportPrintingLabelParts,
  formatPrice,
  formatPriceCompact,
  formatPriceEur,
  formatPublicCode,
  priceColorClass,
} from "./format";

const TEST_LABELS: EnumLabels = {
  finishes: { normal: "Normal", foil: "Foil" },
  rarities: {},
  domains: {},
  cardTypes: {},
  superTypes: {},
  artVariants: {
    normal: "Normal",
    altart: "Alt Art",
    overnumbered: "Overnumbered",
    ultimate: "Ultimate",
  },
  cardSizes: { standard: "Standard", oversized: "Oversized" },
  conditions: {},
  graders: {},
};

function stub(overrides: Partial<Printing> = {}): Printing {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    cardId: "00000000-0000-0000-0000-000000000001",
    shortCode: "OGS-001",
    setId: "",
    setSlug: "",
    setReleased: true,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "",
    publicCode: "ABCD",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
      slug: "OGS-001",
      name: "",
      type: "unit",
      types: ["unit"],
      superTypes: [],
      domains: [],
      tokenCardIds: [],
      energy: 0,
      might: 0,
      power: 0,
      keywords: [],
      tags: [],
      mightBonus: 0,
      maxCopiesOverride: null,
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
// formatImportPrintingLabelParts
// ---------------------------------------------------------------------------

describe("formatImportPrintingLabelParts", () => {
  it("returns the code with no language for a standard English printing", () => {
    expect(formatImportPrintingLabelParts(stub({ shortCode: "OGS-021" }), TEST_LABELS)).toEqual({
      code: "OGS-021",
      language: null,
      rest: [],
    });
  });

  it("surfaces the language code for a non-English printing", () => {
    expect(
      formatImportPrintingLabelParts(stub({ shortCode: "OGS-021", language: "SC" }), TEST_LABELS),
    ).toEqual({ code: "OGS-021", language: "SC", rest: [] });
  });

  it("carries the variant labels in rest, language kept separate", () => {
    expect(
      formatImportPrintingLabelParts(
        stub({ shortCode: "OGS-021", language: "SC", finish: "foil" }),
        TEST_LABELS,
      ),
    ).toEqual({ code: "OGS-021", language: "SC", rest: ["Foil"] });
  });
});

// ---------------------------------------------------------------------------
// formatPriceEur
// ---------------------------------------------------------------------------

describe("formatImportPrintingLabel", () => {
  it("returns just the card id for a standard English printing", () => {
    expect(formatImportPrintingLabel(stub({ shortCode: "OGS-021" }), TEST_LABELS)).toBe("OGS-021");
  });

  it("tags a non-English standard printing with its language", () => {
    expect(
      formatImportPrintingLabel(stub({ shortCode: "OGS-021", language: "SC" }), TEST_LABELS),
    ).toBe("OGS-021 · [SC]");
  });

  it("distinguishes English and Chinese printings that share a code", () => {
    const en = formatImportPrintingLabel(
      stub({ shortCode: "OGS-021", language: "EN" }),
      TEST_LABELS,
    );
    const sc = formatImportPrintingLabel(
      stub({ shortCode: "OGS-021", language: "SC" }),
      TEST_LABELS,
    );
    expect(en).not.toBe(sc);
  });

  it("appends the variant label after the language tag", () => {
    expect(
      formatImportPrintingLabel(
        stub({ shortCode: "OGS-021", language: "SC", finish: "foil" }),
        TEST_LABELS,
      ),
    ).toBe("OGS-021 · [SC] · Foil");
  });

  it("appends the variant label for an English printing without a language tag", () => {
    expect(
      formatImportPrintingLabel(stub({ shortCode: "OGS-021", finish: "foil" }), TEST_LABELS),
    ).toBe("OGS-021 · Foil");
  });
});

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
