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
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    images: [],
    artist: "Test",
    publicCode: overrides.shortCode,
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    card: {
      slug: "test-card",
      name: "Test Card",
      type: "unit",
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
  const zhPrinting = makePrinting({ id: "zh-1", shortCode: "OGN-001", language: "ZH" });
  const allPrintings = [enPrinting, zhPrinting];

  it("resolves to exact match when entry language matches one printing", () => {
    const entries = [makeEntry({ language: "EN" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("en-1");
  });

  it("resolves to the ZH printing when entry language is ZH", () => {
    const entries = [makeEntry({ language: "ZH" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("zh-1");
  });

  it("falls back to all candidates when entry has no language", () => {
    const entries = [makeEntry({ language: undefined })];
    const results = matchEntries(entries, allPrintings);
    // Without language, both EN and ZH match code + finish, so needs-review
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
  const zhNormal = makePrinting({
    id: "zh-normal",
    shortCode: "OGN-001",
    language: "ZH",
    finish: "normal",
  });
  const zhFoil = makePrinting({
    id: "zh-foil",
    shortCode: "OGN-001",
    language: "ZH",
    finish: "foil",
  });
  const allPrintings = [enNormal, enFoil, zhNormal, zhFoil];

  it("narrows by language then finish for exact match", () => {
    const entries = [makeEntry({ language: "EN", finish: "foil" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("en-foil");
  });

  it("narrows by language then finish for ZH foil", () => {
    const entries = [makeEntry({ language: "ZH", finish: "foil" })];
    const results = matchEntries(entries, allPrintings);
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("zh-foil");
  });
});

describe("matchEntries — fallbackLanguage", () => {
  const enPrinting = makePrinting({ id: "en-1", shortCode: "OGN-001", language: "EN" });
  const zhPrinting = makePrinting({ id: "zh-1", shortCode: "OGN-001", language: "ZH" });
  const allPrintings = [enPrinting, zhPrinting];

  it("uses fallbackLanguage when entry has no language", () => {
    const entries = [makeEntry({ language: undefined })];
    const results = matchEntries(entries, allPrintings, "EN");
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("en-1");
  });

  it("entry language takes precedence over fallbackLanguage", () => {
    const entries = [makeEntry({ language: "ZH" })];
    const results = matchEntries(entries, allPrintings, "EN");
    expect(results[0].status).toBe("exact");
    expect(results[0].resolvedPrinting?.id).toBe("zh-1");
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
