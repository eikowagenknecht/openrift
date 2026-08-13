import type { AdminPrintingResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { printingFormDefaults } from "./printing-form-defaults";

const fallbacks = {
  setSlug: "ogn",
  rarity: "common",
  artVariant: "normal",
  finish: "normal",
  size: "standard",
  language: "EN",
};

function stubPrinting(overrides: Partial<AdminPrintingResponse> = {}): AdminPrintingResponse {
  return {
    id: "p-1",
    shortCode: "OGN-202",
    setSlug: "sfd",
    rarity: "epic",
    artVariant: "alternate",
    finish: "foil",
    size: "oversized",
    isSigned: true,
    markerSlugs: ["promo"],
    distributionChannelSlugs: ["worlds-2025"],
    artist: "Jane Doe",
    publicCode: "202/298",
    language: "DE",
    printedName: "Blauer Wächter",
    printedYear: 2025,
    printedRulesText: "Rules",
    printedEffectText: "Effect",
    flavorText: "Flavor",
    ...overrides,
  } as AdminPrintingResponse;
}

describe("printingFormDefaults", () => {
  it("returns blank values and the fallbacks when nothing is duplicated", () => {
    expect(printingFormDefaults(null, fallbacks)).toEqual({
      shortCode: "",
      setId: "ogn",
      rarity: "common",
      artVariant: "normal",
      finish: "normal",
      size: "standard",
      isSigned: false,
      markerSlugs: [],
      distributionChannelSlugs: [],
      artist: "",
      publicCode: "",
      language: "EN",
      printedName: "",
      printedYear: "",
      printedRulesText: "",
      printedEffectText: "",
      flavorText: "",
    });
  });

  it("copies every field from the printing being duplicated", () => {
    expect(printingFormDefaults(stubPrinting(), fallbacks)).toEqual({
      shortCode: "OGN-202",
      setId: "sfd",
      rarity: "epic",
      artVariant: "alternate",
      finish: "foil",
      size: "oversized",
      isSigned: true,
      markerSlugs: ["promo"],
      distributionChannelSlugs: ["worlds-2025"],
      artist: "Jane Doe",
      publicCode: "202/298",
      language: "DE",
      printedName: "Blauer Wächter",
      printedYear: "2025",
      printedRulesText: "Rules",
      printedEffectText: "Effect",
      flavorText: "Flavor",
    });
  });

  it("carries the source size over so a duplicate keeps the printing identity", () => {
    // `size` is part of `uq_printings_identity`. Resetting it to the default
    // silently pointed the duplicate at a different printing.
    const defaults = printingFormDefaults(stubPrinting({ size: "oversized" }), fallbacks);

    expect(defaults.size).toBe("oversized");
  });

  it("renders a missing printed year as an empty string", () => {
    const defaults = printingFormDefaults(stubPrinting({ printedYear: null }), fallbacks);

    expect(defaults.printedYear).toBe("");
  });

  it("keeps a printed year of 0 rather than treating it as missing", () => {
    const defaults = printingFormDefaults(stubPrinting({ printedYear: 0 }), fallbacks);

    expect(defaults.printedYear).toBe("0");
  });

  it("falls back per field when the source leaves nullable text empty", () => {
    const defaults = printingFormDefaults(
      stubPrinting({ printedName: null, printedRulesText: null, flavorText: null }),
      fallbacks,
    );

    expect(defaults.printedName).toBe("");
    expect(defaults.printedRulesText).toBe("");
    expect(defaults.flavorText).toBe("");
    expect(defaults.printedEffectText).toBe("Effect");
  });
});
