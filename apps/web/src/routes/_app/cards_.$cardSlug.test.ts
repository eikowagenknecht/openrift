import type {
  CardDetailResponse,
  CatalogPrintingResponse,
} from "@openrift/shared/types/api/catalog";
import { describe, expect, it } from "vitest";

import { Route } from "./cards_.$cardSlug";

const card: CardDetailResponse["card"] = {
  id: "card-1",
  slug: "inferna",
  name: "Inferna",
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

function makePrinting(id: string, language: string, frontImageId: string): CatalogPrintingResponse {
  return {
    id,
    cardId: "card-1",
    setId: "set-1",
    shortCode: "OGN-202",
    rarity: "rare",
    artVariant: "normal",
    isSigned: false,
    isOvernumbered: false,
    markers: [],
    distributionChannels: [],
    finish: "normal",
    size: "standard",
    images: [{ face: "front", imageId: frontImageId }],
    artist: "",
    publicCode: "OGN-202/298",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: null,
    comment: null,
    language,
    canonicalRank: 0,
  };
}

const en = makePrinting("p-en", "EN", "front-en");
const ja = makePrinting("p-ja", "JA", "front-ja");

interface HeadMeta {
  property?: string;
  name?: string;
  content?: string;
  title?: string;
}

interface MarketplaceOffer {
  seller: string;
  currency: string;
  priceLow: number;
  priceHigh: number;
  offerCount: number;
}

type HeadFn = (ctx: { loaderData: unknown; match: { search: { printingId?: string } } }) => {
  meta: HeadMeta[];
  scripts?: { type: string; children: string }[];
};

function runHeadFull(printingId?: string, marketplaceOffers: MarketplaceOffer[] = []) {
  const loaderData = {
    data: {
      card,
      printings: [en, ja],
      sets: [],
      products: [],
      related: [],
    } satisfies CardDetailResponse,
    languageOrder: ["EN", "DE", "JA"] as const,
    domainLabels: { fury: "Fury" },
    cardTypeLabels: { unit: "Unit" },
    marketplaceOffers,
  };
  const head = Route.options.head as unknown as HeadFn;
  return head({ loaderData, match: { search: { printingId } } });
}

function runHead(printingId?: string): HeadMeta[] {
  return runHeadFull(printingId).meta;
}

function ogImage(meta: HeadMeta[]): string | undefined {
  return meta.find((entry) => entry.property === "og:image")?.content;
}

describe("/cards/$cardSlug SSR head", () => {
  it("uses the pinned printing's art for og:image when ?printingId= is set", () => {
    expect(ogImage(runHead("p-ja"))).toContain("/media/cards/ja/front-ja-full.webp");
  });

  it("sets twitter:image to the pinned printing's art too", () => {
    const meta = runHead("p-ja");
    expect(meta.find((entry) => entry.name === "twitter:image")?.content).toContain(
      "/media/cards/ja/front-ja-full.webp",
    );
  });

  it("falls back to the EN-preferred printing when no ?printingId= is present", () => {
    expect(ogImage(runHead(undefined))).toContain("/media/cards/en/front-en-full.webp");
  });

  it("falls back to the EN-preferred printing when ?printingId= matches no printing", () => {
    expect(ogImage(runHead("does-not-exist"))).toContain("/media/cards/en/front-en-full.webp");
  });

  it("emits no Product JSON-LD when the card has no marketplace prices", () => {
    const scripts = runHeadFull(undefined, []).scripts ?? [];
    expect(scripts.some((script) => script.children.includes('"@type":"Product"'))).toBe(false);
    expect(scripts.some((script) => script.children.includes('"@type":"BreadcrumbList"'))).toBe(
      true,
    );
  });

  it("emits Product JSON-LD with offerCount when marketplace prices exist", () => {
    const scripts = runHeadFull(undefined, [
      { seller: "Cardmarket", currency: "EUR", priceLow: 1.2, priceHigh: 3.4, offerCount: 2 },
    ]).scripts;
    const product = scripts?.find((script) => script.children.includes('"@type":"Product"'));
    expect(product).toBeDefined();
    expect(product?.children).toContain('"offerCount":2');
  });

  it("advertises the price in title and description only when offers exist", () => {
    const withOffers = runHeadFull(undefined, [
      { seller: "TCGplayer", currency: "USD", priceLow: 3.42, priceHigh: 5.1, offerCount: 2 },
    ]).meta;
    expect(withOffers.find((entry) => entry.title)?.title).toContain("Riftbound Card Price & Data");
    expect(withOffers.find((entry) => entry.name === "description")?.content).toContain(
      "Prices from $3.42 (TCGplayer).",
    );

    const withoutOffers = runHeadFull(undefined, []).meta;
    const title = withoutOffers.find((entry) => entry.title)?.title;
    expect(title).toContain("Riftbound Card");
    expect(title).not.toContain("Price");
    expect(withoutOffers.find((entry) => entry.name === "description")?.content).not.toContain(
      "Prices from",
    );
  });
});
