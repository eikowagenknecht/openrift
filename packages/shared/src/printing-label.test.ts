import { describe, expect, it } from "vitest";

import type { VariantLabelEnumLabels, VariantLabelPrinting } from "./printing-label.js";
import { formatPrintingVariantLabel, formatPrintingVariantLabelParts } from "./printing-label.js";

const TEST_LABELS: VariantLabelEnumLabels = {
  finishes: { normal: "Normal", foil: "Foil" },
  artVariants: {
    normal: "Normal",
    altart: "Alt Art",
    overnumbered: "Overnumbered",
    ultimate: "Ultimate",
  },
  cardSizes: { standard: "Standard", oversized: "Oversized" },
};

function stub(overrides: Partial<VariantLabelPrinting> = {}): VariantLabelPrinting {
  return {
    language: "EN",
    artVariant: "normal",
    finish: "normal",
    size: "standard",
    isSigned: false,
    isOvernumbered: false,
    markers: [],
    ...overrides,
  };
}

describe("formatPrintingVariantLabel", () => {
  it('returns "Standard" when nothing distinguishes the printing', () => {
    expect(formatPrintingVariantLabel(stub(), undefined, TEST_LABELS)).toBe("Standard");
  });

  it("shows non-normal attributes when no siblings provided", () => {
    const p = stub({
      artVariant: "altart",
      finish: "foil",
      isSigned: true,
      markers: [{ slug: "promo", label: "Promo" }],
    });
    expect(formatPrintingVariantLabel(p, undefined, TEST_LABELS)).toBe(
      "Alt Art · Foil · Signed · Promo",
    );
  });

  it("uses the label map for custom finish slugs", () => {
    const labels: VariantLabelEnumLabels = {
      ...TEST_LABELS,
      finishes: { ...TEST_LABELS.finishes, metal: "Metal" },
    };
    expect(formatPrintingVariantLabel(stub({ finish: "metal" }), undefined, labels)).toBe("Metal");
  });

  it("labels an overnumbered printing even without an in-total sibling", () => {
    expect(formatPrintingVariantLabel(stub({ isOvernumbered: true }), undefined, TEST_LABELS)).toBe(
      "Overnumbered",
    );
  });

  it("labels alt art and overnumbered together", () => {
    const p = stub({ artVariant: "altart", isOvernumbered: true });
    expect(formatPrintingVariantLabel(p, undefined, TEST_LABELS)).toBe("Alt Art · Overnumbered");
  });

  it("labels an oversized printing even without a standard sibling", () => {
    expect(formatPrintingVariantLabel(stub({ size: "oversized" }), undefined, TEST_LABELS)).toBe(
      "Oversized",
    );
  });

  it("distinguishes an oversized printing from its identical-art standard twin", () => {
    const standard = stub({ size: "standard" });
    const oversized = stub({ size: "oversized" });
    const siblings = [standard, oversized];
    expect(formatPrintingVariantLabel(standard, siblings, TEST_LABELS)).toBe("Standard");
    expect(formatPrintingVariantLabel(oversized, siblings, TEST_LABELS)).toBe("Oversized");
  });

  it("combines size with other distinguishing attributes", () => {
    const oversizedFoil = stub({ size: "oversized", finish: "foil" });
    const siblings = [stub({ finish: "normal" }), oversizedFoil];
    expect(formatPrintingVariantLabel(oversizedFoil, siblings, TEST_LABELS)).toBe(
      "Foil · Oversized",
    );
  });

  it("distinguishes a foil printing from its standard sibling", () => {
    const standard = stub({ finish: "normal" });
    const foil = stub({ finish: "foil" });
    const siblings = [standard, foil];
    expect(formatPrintingVariantLabel(standard, siblings, TEST_LABELS)).toBe("Standard");
    expect(formatPrintingVariantLabel(foil, siblings, TEST_LABELS)).toBe("Foil");
  });

  it("omits attributes shared by all siblings", () => {
    const base = { finish: "foil" };
    const p = stub({ ...base, artVariant: "altart" });
    const siblings = [p, stub({ ...base, artVariant: "normal" })];
    expect(formatPrintingVariantLabel(p, siblings, TEST_LABELS)).toBe("Alt Art");
  });

  it("includes attributes that differ among siblings", () => {
    const markers = [{ slug: "promo", label: "Promo" }];
    const p = stub({ isSigned: true, markers });
    const siblings = [p, stub({ isSigned: false, markers })];
    expect(formatPrintingVariantLabel(p, siblings, TEST_LABELS)).toBe("Signed");
  });

  it("joins multiple distinguishing attributes with ·", () => {
    const p = stub({ artVariant: "altart", isSigned: true });
    const siblings = [p, stub()];
    expect(formatPrintingVariantLabel(p, siblings, TEST_LABELS)).toBe("Alt Art · Signed");
  });

  it("tags every row with [XX] when language varies, including English", () => {
    const en = stub({ language: "EN" });
    const sc = stub({ language: "SC" });
    const siblings = [en, sc];
    expect(formatPrintingVariantLabel(en, siblings, TEST_LABELS)).toBe("[EN]");
    expect(formatPrintingVariantLabel(sc, siblings, TEST_LABELS)).toBe("[SC]");
  });

  it("puts the language tag before other distinguishing attributes", () => {
    const p = stub({ language: "SC", artVariant: "altart", isSigned: true });
    const siblings = [p, stub({ language: "EN" })];
    expect(formatPrintingVariantLabel(p, siblings, TEST_LABELS)).toBe("[SC] · Alt Art · Signed");
  });

  it("omits the language tag when every sibling shares the language", () => {
    const p = stub({ language: "EN", artVariant: "altart" });
    const siblings = [p, stub({ language: "EN" })];
    expect(formatPrintingVariantLabel(p, siblings, TEST_LABELS)).toBe("Alt Art");
  });

  it("omits the language tag when no siblings are provided", () => {
    expect(formatPrintingVariantLabel(stub({ language: "SC" }), undefined, TEST_LABELS)).toBe(
      "Standard",
    );
  });

  it("labels a non-normal art variant even when it is the only sibling", () => {
    const p = stub({ artVariant: "altart" });
    expect(formatPrintingVariantLabel(p, [p], TEST_LABELS)).toBe("Alt Art");
  });

  it("labels a non-normal art variant when every sibling shares it", () => {
    const p = stub({ artVariant: "altart" });
    const siblings = [p, stub({ artVariant: "altart", isSigned: true })];
    expect(formatPrintingVariantLabel(p, siblings, TEST_LABELS)).toBe("Alt Art");
  });
});

describe("formatPrintingVariantLabelParts", () => {
  it("returns no language and no rest for a standard printing without siblings", () => {
    expect(formatPrintingVariantLabelParts(stub(), undefined, TEST_LABELS)).toEqual({
      language: null,
      rest: [],
    });
  });

  it("surfaces the language code (not a [XX] tag) when siblings differ", () => {
    const en = stub({ language: "EN" });
    const sc = stub({ language: "SC" });
    const siblings = [en, sc];
    expect(formatPrintingVariantLabelParts(sc, siblings, TEST_LABELS)).toEqual({
      language: "SC",
      rest: [],
    });
    expect(formatPrintingVariantLabelParts(en, siblings, TEST_LABELS)).toEqual({
      language: "EN",
      rest: [],
    });
  });

  it("keeps the language separate from the non-language attribute labels", () => {
    const p = stub({ language: "SC", artVariant: "altart", isSigned: true });
    const siblings = [p, stub({ language: "EN" })];
    expect(formatPrintingVariantLabelParts(p, siblings, TEST_LABELS)).toEqual({
      language: "SC",
      rest: ["Alt Art", "Signed"],
    });
  });

  it("omits the language when every sibling shares it", () => {
    const p = stub({ language: "EN", artVariant: "altart" });
    const siblings = [p, stub({ language: "EN" })];
    expect(formatPrintingVariantLabelParts(p, siblings, TEST_LABELS)).toEqual({
      language: null,
      rest: ["Alt Art"],
    });
  });
});
