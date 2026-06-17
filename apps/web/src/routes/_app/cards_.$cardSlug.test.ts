import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { Route } from "./cards_.$cardSlug";

const card: CardDetailResponse["card"] = {
  id: "card-1",
  slug: "inferna",
  name: "Inferna",
  type: "unit",
  superTypes: [],
  domains: ["fury"],
  energy: 3,
  might: 4,
  power: 0,
  mightBonus: null,
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
    markers: [],
    distributionChannels: [],
    finish: "normal",
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

// EN is the language-preferred fallback; JA is the variant a `?printingId=`
// link pins. Their front images differ so the og:image is unambiguous.
const en = makePrinting("p-en", "EN", "front-en");
const ja = makePrinting("p-ja", "JA", "front-ja");

interface HeadMeta {
  property?: string;
  name?: string;
  content?: string;
  title?: string;
}

type HeadFn = (ctx: { loaderData: unknown; match: { search: { printingId?: string } } }) => {
  meta: HeadMeta[];
};

function runHead(printingId?: string): HeadMeta[] {
  const loaderData = {
    data: { card, printings: [en, ja], sets: [] } satisfies CardDetailResponse,
    languageOrder: ["EN", "DE", "JA"] as const,
    domainLabels: { fury: "Fury" },
    cardTypeLabels: { unit: "Unit" },
    marketplaceOffers: [],
  };
  // The head() signature is heavily generic; we only exercise the two fields it
  // reads. Cast to a minimal shape rather than reconstruct the full match.
  const head = Route.options.head as unknown as HeadFn;
  return head({ loaderData, match: { search: { printingId } } }).meta;
}

function ogImage(meta: HeadMeta[]): string | undefined {
  return meta.find((entry) => entry.property === "og:image")?.content;
}

describe("/cards/$cardSlug SSR head", () => {
  // Regression: the head used to read `printingId` from loaderData, but the
  // loader is memoized on an empty `loaderDeps`, so the per-variant id never
  // reached it during SSR — every shared `?printingId=` link unfurled with the
  // EN-preferred art instead of the pinned variant. The head now reads
  // `match.search.printingId` directly. This fails if it reverts to loaderData.
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
});
