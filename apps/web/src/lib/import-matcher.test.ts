import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { matchEntries } from "./import-matcher";
import type { ImportEntry } from "./import-parsers";

/**
 * Minimal printing factory for matcher tests.
 * @returns A Printing with sensible defaults, overridden by the given fields.
 */
function makePrinting(overrides: Partial<Printing> & { id: string; shortCode: string }): Printing {
  return {
    cardId: "card-1",
    setId: "set-1",
    setSlug: "ogn",
    setReleased: true,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "Test",
    publicCode: overrides.shortCode,
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
      slug: "test-card",
      name: "Test Card",
      type: "unit",
      types: ["unit"],
      superTypes: [],
      domains: [],
      might: null,
      energy: null,
      power: null,
      keywords: [],
      tags: [],
      mightBonus: null,
      errata: null,
      bans: [],
    },
    ...overrides,
  };
}

/** @returns An ImportEntry with sensible defaults, overridden by the given fields. */
function makeEntry(overrides: Partial<ImportEntry>): ImportEntry {
  return {
    setPrefix: "OGN",
    finish: "normal",
    artVariant: "normal",
    quantity: 1,
    cardName: "Test Card",
    sourceCode: "OGN-001",
    rawFields: {},
    ...overrides,
  };
}

describe("matchEntries — language narrowing", () => {
  const enPrinting = makePrinting({ id: "en-1", shortCode: "OGN-001", language: "EN" });
  const scPrinting = makePrinting({ id: "sc-1", shortCode: "OGN-001", language: "SC" });
  const allPrintings = [enPrinting, scPrinting];

  it("resolves to exact match when entry language matches one printing", () => {
    const entries = [makeEntry({ language: "EN" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("en-1");
  });

  it("resolves to the SC printing when entry language is SC", () => {
    const entries = [makeEntry({ language: "SC" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("sc-1");
  });

  it("falls back to all candidates when entry has no language", () => {
    const entries = [makeEntry({ language: undefined })];
    const results = matchEntries(entries, allPrintings);
    // Without language, both EN and SC match code + finish, so needs-review
    expect(results[0].status).toBe("needs-review");
    expect(results[0].candidates).toHaveLength(2);
  });

  it("falls back to all candidates when entry language matches no printings", () => {
    const entries = [makeEntry({ language: "FR" })];
    const results = matchEntries(entries, allPrintings);
    // FR doesn't exist, so narrowByLanguage falls back to all
    expect(results[0].status).toBe("needs-review");
    expect(results[0].candidates).toHaveLength(2);
  });

  it("narrows candidates list to the matched language", () => {
    const entries = [makeEntry({ language: "EN" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].candidates).toHaveLength(1);
    expect(results[0].candidates[0].language).toBe("EN");
  });
});

describe("matchEntries — language + finish combination", () => {
  const enNormal = makePrinting({
    id: "en-normal",
    shortCode: "OGN-001",
    language: "EN",
    finish: "normal",
  });
  const enFoil = makePrinting({
    id: "en-foil",
    shortCode: "OGN-001",
    language: "EN",
    finish: "foil",
  });
  const scNormal = makePrinting({
    id: "sc-normal",
    shortCode: "OGN-001",
    language: "SC",
    finish: "normal",
  });
  const scFoil = makePrinting({
    id: "sc-foil",
    shortCode: "OGN-001",
    language: "SC",
    finish: "foil",
  });
  const allPrintings = [enNormal, enFoil, scNormal, scFoil];

  it("narrows by language then finish for exact match", () => {
    const entries = [makeEntry({ language: "EN", finish: "foil" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("en-foil");
  });

  it("narrows by language then finish for SC foil", () => {
    const entries = [makeEntry({ language: "SC", finish: "foil" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("sc-foil");
  });
});

describe("matchEntries — fallbackLanguage", () => {
  const enPrinting = makePrinting({ id: "en-1", shortCode: "OGN-001", language: "EN" });
  const scPrinting = makePrinting({ id: "sc-1", shortCode: "OGN-001", language: "SC" });
  const allPrintings = [enPrinting, scPrinting];

  it("uses fallbackLanguage when entry has no language", () => {
    const entries = [makeEntry({ language: undefined })];
    const results = matchEntries(entries, allPrintings, "EN");
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("en-1");
  });

  it("entry language takes precedence over fallbackLanguage", () => {
    const entries = [makeEntry({ language: "SC" })];
    const results = matchEntries(entries, allPrintings, "EN");
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("sc-1");
  });

  it("falls back to all candidates when fallbackLanguage matches nothing", () => {
    const entries = [makeEntry({ language: undefined })];
    const results = matchEntries(entries, allPrintings, "FR");
    expect(results[0].status).toBe("needs-review");
    expect(results[0].candidates).toHaveLength(2);
  });
});

describe("matchEntries — isPromo flag", () => {
  const basePrinting = makePrinting({
    id: "base",
    shortCode: "OGN-001",
    finish: "foil",
    markers: [],
    distributionChannels: [],
  });
  const promoPrinting = makePrinting({
    id: "promo-nexus",
    shortCode: "OGN-001",
    finish: "foil",
    markers: [{ id: "pt-nexus", slug: "nexus", label: "Nexus", description: null }],
    distributionChannels: [],
  });

  it("auto-resolves to the single promo printing when isPromo is set", () => {
    const entries = [makeEntry({ finish: "foil", language: "EN", isPromo: true })];
    const results = matchEntries(entries, [basePrinting, promoPrinting]);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("promo-nexus");
  });

  it("returns needs-review with promo candidates when multiple promos exist", () => {
    const promoRelease = makePrinting({
      id: "promo-release",
      shortCode: "OGN-001",
      finish: "foil",
      markers: [{ id: "pt-release", slug: "release", label: "Release", description: null }],
      distributionChannels: [],
    });
    const entries = [makeEntry({ finish: "foil", language: "EN", isPromo: true })];
    const results = matchEntries(entries, [basePrinting, promoPrinting, promoRelease]);
    expect(results[0].status).toBe("needs-review");
    // Candidates should only include promo printings, not the base
    expect(results[0].candidates).toHaveLength(2);
    expect(results[0].candidates.every((c) => c.markers.length > 0)).toBe(true);
  });

  it("falls back to all candidates when no promo printings exist", () => {
    const entries = [makeEntry({ finish: "foil", language: "EN", isPromo: true })];
    const results = matchEntries(entries, [basePrinting]);
    expect(results[0].status).toBe("needs-review");
    expect(results[0].candidates).toHaveLength(1);
  });

  it("without isPromo, prefers non-promo base printing", () => {
    const entries = [makeEntry({ finish: "foil", language: "EN" })];
    const results = matchEntries(entries, [basePrinting, promoPrinting]);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("base");
  });
});

describe("matchEntries — multi-marker promo slugs", () => {
  const nexusMarker = { id: "pt-nexus", slug: "nexus", label: "Nexus", description: null };
  const releaseMarker = { id: "pt-release", slug: "release", label: "Release", description: null };
  const singleMarkerPromo = makePrinting({
    id: "promo-nexus",
    shortCode: "OGN-001",
    finish: "foil",
    markers: [nexusMarker],
    distributionChannels: [],
  });
  const multiMarkerPromo = makePrinting({
    id: "promo-nexus-release",
    shortCode: "OGN-001",
    finish: "foil",
    markers: [nexusMarker, releaseMarker],
    distributionChannels: [],
  });

  it("resolves a +-joined promo cell (as written by the CSV export) exactly", () => {
    const entries = [makeEntry({ finish: "foil", language: "EN", promoSlug: "release+nexus" })];
    const results = matchEntries(entries, [singleMarkerPromo, multiMarkerPromo]);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("promo-nexus-release");
  });

  it("still resolves single-slug promo entries", () => {
    const entries = [makeEntry({ finish: "foil", language: "EN", promoSlug: "nexus" })];
    // Only the single-marker printing carries exactly the nexus marker alone;
    // both carry it, so this narrows by slug and needs review across the two.
    const results = matchEntries(entries, [singleMarkerPromo, multiMarkerPromo]);
    expect(results[0].status).toBe("needs-review");
    expect(results[0].candidates).toHaveLength(2);
  });
});

describe("matchEntries — Legend colloquial names", () => {
  const legend = makePrinting({
    id: "ogn-100",
    shortCode: "OGN-100",
    card: {
      slug: "emperor-of-the-sands",
      name: "Emperor of the Sands",
      type: "legend",
      types: ["legend"],
      superTypes: [],
      domains: [],
      might: null,
      energy: null,
      power: null,
      keywords: [],
      tags: ["Azir"],
      mightBonus: null,
      errata: null,
      bans: [],
    },
  });

  it("resolves the 'Azir, Emperor of the Sands' colloquial form", () => {
    const entries = [makeEntry({ cardName: "Azir, Emperor of the Sands", sourceCode: "" })];
    const results = matchEntries(entries, [legend]);
    expect(results[0].status).toBe("needs-review");
    expect(results[0].resolvedPrinting?.id).toBe("ogn-100");
    expect(results[0].suggestedName).toBe("Emperor of the Sands");
  });

  it("still resolves the bare name without the 'Azir, ' prefix", () => {
    const entries = [makeEntry({ cardName: "Emperor of the Sands", sourceCode: "" })];
    const results = matchEntries(entries, [legend]);
    expect(results[0].status).toBe("needs-review");
    expect(results[0].resolvedPrinting?.id).toBe("ogn-100");
  });

  it("does not resolve when the tag prefix names a different champion", () => {
    const entries = [makeEntry({ cardName: "Xerath, Emperor of the Sands", sourceCode: "" })];
    const results = matchEntries(entries, [legend]);
    expect(results[0].status).toBe("unresolved");
  });
});
