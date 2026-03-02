import type { Card } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  formatCardId,
  formatCardIdCompact,
  formatPrice,
  formatPriceCompact,
  formatPublicCode,
  priceColorClass,
} from "./format";

function stub(overrides: Partial<Card> = {}): Card {
  return {
    id: "OGS-001",
    name: "",
    type: "Unit",
    superTypes: [],
    rarity: "Common",
    collectorNumber: 1,
    faction: "",
    stats: { energy: 0, might: 0, power: 0 },
    keywords: [],
    description: "",
    effect: "",
    mightBonus: 0,
    set: "",
    art: { thumbnailURL: "", fullURL: "", artist: "" },
    tags: [],
    orientation: "portrait",
    publicCode: "ABCD",
    ...overrides,
  } satisfies Card;
}

// ---------------------------------------------------------------------------
// formatCardId
// ---------------------------------------------------------------------------

describe("formatCardId", () => {
  it("returns the full card id", () => {
    expect(formatCardId(stub({ id: "OGS-042" }))).toBe("OGS-042");
  });
});

// ---------------------------------------------------------------------------
// formatCardIdCompact
// ---------------------------------------------------------------------------

describe("formatCardIdCompact", () => {
  it("returns suffix after last dash prefixed with #", () => {
    expect(formatCardIdCompact(stub({ id: "OGS-042" }))).toBe("#042");
  });

  it("handles multi-dash ids (uses last dash)", () => {
    expect(formatCardIdCompact(stub({ id: "SET-A-123" }))).toBe("#123");
  });

  it("returns full id with # when no dash present", () => {
    expect(formatCardIdCompact(stub({ id: "NODASH" }))).toBe("#NODASH");
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
    expect(formatPrice(undefined)).toBe("--");
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
    expect(priceColorClass(undefined)).toBe("text-muted-foreground");
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

describe("formatPriceCompact", () => {
  it('returns "--" for null', () => {
    expect(formatPriceCompact(null)).toBe("--");
  });

  it('returns "--" for undefined', () => {
    expect(formatPriceCompact(undefined)).toBe("--");
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

  it("uses k-tier with one decimal for 1000–9999", () => {
    expect(formatPriceCompact(1000)).toBe("$1.0k");
    expect(formatPriceCompact(2500)).toBe("$2.5k");
    expect(formatPriceCompact(9999)).toBe("$10.0k");
  });

  it("rounds to integer k for >= 10000", () => {
    expect(formatPriceCompact(10000)).toBe("$10k");
    expect(formatPriceCompact(25000)).toBe("$25k");
  });

  it("bumps to k-tier when rounding crosses 1000", () => {
    expect(formatPriceCompact(999.5)).toBe("$1.0k");
  });
});
