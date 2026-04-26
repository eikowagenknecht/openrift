import { describe, expect, it } from "vitest";

import { productJsonLd } from "./seo";

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
