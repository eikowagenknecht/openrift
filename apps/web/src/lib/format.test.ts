import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  formatCardId,
  formatCardIdCompact,
  formatPrice,
  formatPriceCompact,
  formatPriceRange,
  formatPublicCode,
  priceColorClass,
} from "./format";

function stub(overrides: Partial<Printing> = {}): Printing {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "OGS-001:common:normal:",
    sourceId: "OGS-001",
    set: "",
    collectorNumber: 1,
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    isPromo: false,
    finish: "normal",
    images: [],
    artist: "",
    publicCode: "ABCD",
    card: {
      id: "00000000-0000-0000-0000-000000000001",
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
      rulesText: "",
      effectText: "",
    },
    ...overrides,
  } satisfies Printing;
}

// ---------------------------------------------------------------------------
// formatCardId
// ---------------------------------------------------------------------------

describe("formatCardId", () => {
  it("returns the source id", () => {
    expect(formatCardId(stub({ sourceId: "OGS-042" }))).toBe("OGS-042");
  });
});

// ---------------------------------------------------------------------------
// formatCardIdCompact
// ---------------------------------------------------------------------------

describe("formatCardIdCompact", () => {
  it("returns suffix after last dash prefixed with #", () => {
    expect(formatCardIdCompact(stub({ sourceId: "OGS-042" }))).toBe("#042");
  });

  it("handles multi-dash ids (uses last dash)", () => {
    expect(formatCardIdCompact(stub({ sourceId: "SET-A-123" }))).toBe("#123");
  });

  it("returns full id with # when no dash present", () => {
    expect(formatCardIdCompact(stub({ sourceId: "NODASH" }))).toBe("#NODASH");
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
