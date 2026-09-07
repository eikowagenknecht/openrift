import { describe, expect, it } from "vitest";

import { joinCatalogPrintings } from "./catalog-join";
import type { CatalogResponse } from "./types/api/catalog.js";

const CARD_ID = "00000000-0000-0000-0000-000000000001";
const SET_ID = "00000000-0000-0000-0000-0000000000a1";

function card(overrides: Partial<CatalogResponse["cards"][string]> = {}) {
  return {
    slug: "SET1-001",
    name: "Test Card",
    type: "unit",
    types: ["unit"],
    superTypes: [],
    domains: ["fury"],
    tokenCardIds: [],
    energy: 3,
    might: 2,
    power: 4,
    keywords: [],
    tags: [],
    mightBonus: 0,
    maxCopiesOverride: null,
    errata: null,
    bans: [],
    ...overrides,
  } as CatalogResponse["cards"][string];
}

function printingValue(overrides: Partial<CatalogResponse["printings"][string]> = {}) {
  return {
    cardId: CARD_ID,
    shortCode: "SET1-001",
    setId: SET_ID,
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [],
    artist: "Jane Doe",
    publicCode: "ABCD",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language: "EN",
    canonicalRank: 0,
    ...overrides,
  } as CatalogResponse["printings"][string];
}

function catalog(overrides: Partial<CatalogResponse> = {}): CatalogResponse {
  return {
    sets: [
      {
        id: SET_ID,
        slug: "OGN",
        name: "Origins",
        releases: { EN: { releasedAt: "2020-01-01", precision: "day" } },
        setType: "main",
      },
    ],
    cards: { [CARD_ID]: card() },
    printings: { "printing-1": printingValue() },
    totalCopies: 0,
    customTagAssignments: {},
    ...overrides,
  } as CatalogResponse;
}

describe("joinCatalogPrintings", () => {
  it("restores the map key as the printing id", () => {
    const [printing] = joinCatalogPrintings(catalog());
    expect(printing!.id).toBe("printing-1");
  });

  it("attaches the parent set's slug and the printing's card", () => {
    const [printing] = joinCatalogPrintings(catalog());
    expect(printing!.setSlug).toBe("OGN");
    expect(printing!.card.name).toBe("Test Card");
  });

  it("marks a printing released when its language has a past release date", () => {
    const [printing] = joinCatalogPrintings(catalog());
    expect(printing!.setReleased).toBe(true);
  });

  it("resolves release per printing language, not per set", () => {
    const joined = joinCatalogPrintings(
      catalog({
        sets: [
          {
            id: SET_ID,
            slug: "OGN",
            name: "Origins",
            releases: {
              EN: { releasedAt: "2020-01-01", precision: "day" },
              FR: { releasedAt: "2999-01-01", precision: "day" },
            },
            setType: "main",
          },
        ],
        printings: {
          en: printingValue({ language: "EN" }),
          fr: printingValue({ language: "FR" }),
        },
      } as Partial<CatalogResponse>),
    );
    expect(joined.find((p) => p.id === "en")?.setReleased).toBe(true);
    expect(joined.find((p) => p.id === "fr")?.setReleased).toBe(false);
  });

  it("treats a language with no release entry as unreleased", () => {
    const joined = joinCatalogPrintings(
      catalog({ printings: { de: printingValue({ language: "DE" }) } } as Partial<CatalogResponse>),
    );
    expect(joined[0]!.setReleased).toBe(false);
  });

  it("drops a printing whose set is absent from the payload", () => {
    const joined = joinCatalogPrintings(
      catalog({
        printings: { orphan: printingValue({ setId: "missing-set" }) },
      } as Partial<CatalogResponse>),
    );
    expect(joined).toEqual([]);
  });

  it("drops a printing whose card is absent from the payload", () => {
    const joined = joinCatalogPrintings(
      catalog({
        printings: { orphan: printingValue({ cardId: "missing-card" }) },
      } as Partial<CatalogResponse>),
    );
    expect(joined).toEqual([]);
  });

  it("returns an empty array for a catalog with no printings", () => {
    expect(joinCatalogPrintings(catalog({ printings: {} }))).toEqual([]);
  });

  it("carries the wire value's own fields through untouched", () => {
    const [printing] = joinCatalogPrintings(
      catalog({
        printings: { p: printingValue({ canonicalRank: 42, artist: "Someone Else" }) },
      } as Partial<CatalogResponse>),
    );
    expect(printing!.canonicalRank).toBe(42);
    expect(printing!.artist).toBe("Someone Else");
  });
});
