import { describe, expect, it } from "vitest";

import {
  articleJsonLd,
  collectionPageJsonLd,
  organizationJsonLd,
  productJsonLd,
  toAbsoluteUrl,
} from "./seo";

interface ProductOffer {
  "@type": string;
  priceCurrency: string;
  price?: number;
  lowPrice?: number;
  highPrice?: number;
  availability?: string;
  seller?: { "@type": string; name: string };
}

interface ProductPayload {
  "@context": string;
  "@type": string;
  name: string;
  url: string;
  brand: { "@type": string; name: string };
  offers?: ProductOffer[];
}

function parseProduct(script: { type: string; children: string }): ProductPayload {
  return JSON.parse(script.children) as ProductPayload;
}

describe("productJsonLd", () => {
  const baseOptions = {
    siteUrl: "https://openrift.app",
    name: "Test Card",
    description: "A test card.",
    image: "https://openrift.app/img.webp",
    url: "/cards/test-card",
  };

  it("omits offers entirely when no marketplace prices are provided", () => {
    const payload = parseProduct(productJsonLd({ ...baseOptions }));
    expect(payload.offers).toBeUndefined();
  });

  it("emits a single Offer per marketplace when low equals high", () => {
    const payload = parseProduct(
      productJsonLd({
        ...baseOptions,
        marketplaceOffers: [
          { seller: "TCGplayer", currency: "USD", priceLow: 4.5, priceHigh: 4.5 },
        ],
      }),
    );

    expect(payload.offers).toHaveLength(1);
    const offer = payload.offers?.[0];
    expect(offer?.["@type"]).toBe("Offer");
    expect(offer?.price).toBe(4.5);
    expect(offer?.priceCurrency).toBe("USD");
    expect(offer?.lowPrice).toBeUndefined();
    expect(offer?.highPrice).toBeUndefined();
  });

  it("emits an AggregateOffer when low and high differ", () => {
    const payload = parseProduct(
      productJsonLd({
        ...baseOptions,
        marketplaceOffers: [
          { seller: "Cardmarket", currency: "EUR", priceLow: 1.2, priceHigh: 3.4 },
        ],
      }),
    );

    const offer = payload.offers?.[0];
    expect(offer?.["@type"]).toBe("AggregateOffer");
    expect(offer?.lowPrice).toBe(1.2);
    expect(offer?.highPrice).toBe(3.4);
    expect(offer?.price).toBeUndefined();
  });

  it("attributes each offer to its third-party seller and never to OpenRift", () => {
    const payload = parseProduct(
      productJsonLd({
        ...baseOptions,
        marketplaceOffers: [
          { seller: "TCGplayer", currency: "USD", priceLow: 4.5, priceHigh: 4.5 },
          { seller: "Cardmarket", currency: "EUR", priceLow: 1.2, priceHigh: 3.4 },
          { seller: "CardTrader", currency: "EUR", priceLow: 2, priceHigh: 2 },
        ],
      }),
    );

    expect(payload.offers).toHaveLength(3);
    const sellerNames = payload.offers?.map((o) => o.seller?.name);
    expect(sellerNames).toEqual(["TCGplayer", "Cardmarket", "CardTrader"]);
    for (const offer of payload.offers ?? []) {
      expect(offer.seller?.["@type"]).toBe("Organization");
      expect(offer.seller?.name).not.toBe("OpenRift");
    }
  });

  it("never claims availability — we don't verify third-party inventory", () => {
    const payload = parseProduct(
      productJsonLd({
        ...baseOptions,
        marketplaceOffers: [
          { seller: "TCGplayer", currency: "USD", priceLow: 1, priceHigh: 5 },
          { seller: "Cardmarket", currency: "EUR", priceLow: 2, priceHigh: 2 },
        ],
      }),
    );

    for (const offer of payload.offers ?? []) {
      expect(offer.availability).toBeUndefined();
    }
  });

  it("includes brand and absolute url", () => {
    const payload = parseProduct(productJsonLd({ ...baseOptions }));
    expect(payload.brand).toEqual({ "@type": "Brand", name: "Riftbound" });
    expect(payload.url).toBe("https://openrift.app/cards/test-card");
  });
});

describe("toAbsoluteUrl", () => {
  const siteUrl = "https://openrift.app";

  it("returns undefined when no image URL is given", () => {
    expect(toAbsoluteUrl(siteUrl, undefined)).toBeUndefined();
  });

  it("passes through fully-qualified https URLs unchanged", () => {
    expect(toAbsoluteUrl(siteUrl, "https://cdn.example/img.webp")).toBe(
      "https://cdn.example/img.webp",
    );
  });

  it("passes through http URLs unchanged", () => {
    expect(toAbsoluteUrl(siteUrl, "http://cdn.example/img.webp")).toBe(
      "http://cdn.example/img.webp",
    );
  });

  it("prefixes root-relative paths with the site URL", () => {
    expect(toAbsoluteUrl(siteUrl, "/media/cards/foo.webp")).toBe(
      "https://openrift.app/media/cards/foo.webp",
    );
  });

  it("inserts a slash for relative paths missing one", () => {
    expect(toAbsoluteUrl(siteUrl, "media/cards/foo.webp")).toBe(
      "https://openrift.app/media/cards/foo.webp",
    );
  });
});

const SITE_URL = "https://openrift.app";

// oxlint-disable-next-line typescript/no-explicit-any -- JSON-LD payloads are dynamic; assertions check specific fields.
function parseJsonLd(script: { type: string; children: string }): any {
  // oxlint-disable-next-line typescript/no-unsafe-return -- see above.
  return JSON.parse(script.children);
}

describe("organizationJsonLd", () => {
  it("emits Organization with default logo and no sameAs when omitted", () => {
    const json = parseJsonLd(organizationJsonLd(SITE_URL));
    expect(json["@type"]).toBe("Organization");
    expect(json.logo).toBe(`${SITE_URL}/logo.webp`);
    expect(json.sameAs).toBeUndefined();
  });

  it("includes sameAs profiles when provided", () => {
    const json = parseJsonLd(
      organizationJsonLd(SITE_URL, {
        sameAs: ["https://github.com/openriftapp/openrift"],
      }),
    );
    expect(json.sameAs).toEqual(["https://github.com/openriftapp/openrift"]);
  });
});

describe("collectionPageJsonLd", () => {
  it("emits CollectionPage without mainEntity when items is empty", () => {
    const json = parseJsonLd(
      collectionPageJsonLd({
        siteUrl: SITE_URL,
        name: "Cards",
        description: "All cards",
        path: "/cards",
      }),
    );
    expect(json["@type"]).toBe("CollectionPage");
    expect(json.url).toBe(`${SITE_URL}/cards`);
    expect(json.mainEntity).toBeUndefined();
  });

  it("emits an ItemList with absolute URLs and 1-based positions", () => {
    const json = parseJsonLd(
      collectionPageJsonLd({
        siteUrl: SITE_URL,
        name: "Sets",
        description: "All sets",
        path: "/sets",
        items: [
          { name: "Origins", url: "/sets/origins", image: "/img/origins.png" },
          { name: "Proving Grounds", url: "https://cdn.example.com/pg" },
        ],
      }),
    );
    expect(json.mainEntity["@type"]).toBe("ItemList");
    expect(json.mainEntity.numberOfItems).toBe(2);
    expect(json.mainEntity.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      url: `${SITE_URL}/sets/origins`,
      name: "Origins",
      image: `${SITE_URL}/img/origins.png`,
    });
    expect(json.mainEntity.itemListElement[1].url).toBe("https://cdn.example.com/pg");
  });

  it("emits every item even for large lists", () => {
    const items = Array.from({ length: 1500 }, (_, i) => ({
      name: `Card ${i}`,
      url: `/cards/card-${i}`,
    }));
    const json = parseJsonLd(
      collectionPageJsonLd({
        siteUrl: SITE_URL,
        name: "Cards",
        description: "x",
        path: "/cards",
        items,
      }),
    );
    expect(json.mainEntity.numberOfItems).toBe(1500);
    expect(json.mainEntity.itemListElement).toHaveLength(1500);
    expect(json.mainEntity.itemListElement.at(-1)).toEqual({
      "@type": "ListItem",
      position: 1500,
      url: `${SITE_URL}/cards/card-1499`,
      name: "Card 1499",
    });
  });
});

describe("articleJsonLd", () => {
  it("emits Article with mainEntityOfPage pointing at the canonical URL", () => {
    const json = parseJsonLd(
      articleJsonLd({
        siteUrl: SITE_URL,
        headline: "Importing & Exporting",
        description: "How to import a CSV.",
        path: "/help/import-export",
      }),
    );
    expect(json["@type"]).toBe("Article");
    expect(json.headline).toBe("Importing & Exporting");
    expect(json.url).toBe(`${SITE_URL}/help/import-export`);
    expect(json.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${SITE_URL}/help/import-export`,
    });
    expect(json.publisher.logo.url).toBe(`${SITE_URL}/logo.webp`);
    expect(json.author.name).toBe("OpenRift");
    expect(json.datePublished).toBeUndefined();
  });

  it("includes datePublished and dateModified when provided", () => {
    const json = parseJsonLd(
      articleJsonLd({
        siteUrl: SITE_URL,
        headline: "Changelog",
        description: "x",
        path: "/changelog",
        datePublished: "2026-01-01",
        dateModified: "2026-04-26",
      }),
    );
    expect(json.datePublished).toBe("2026-01-01");
    expect(json.dateModified).toBe("2026-04-26");
  });
});
