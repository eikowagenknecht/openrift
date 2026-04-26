import { describe, expect, it } from "vitest";

import {
  articleJsonLd,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  organizationJsonLd,
  productJsonLd,
  seoHead,
  websiteJsonLd,
} from "./seo";

const SITE_URL = "https://openrift.app";

function parseJsonLd(script: { type: string; children: string }) {
  expect(script.type).toBe("application/ld+json");
  return JSON.parse(script.children);
}

describe("seoHead", () => {
  it("emits canonical link, OG, and Twitter tags by default", () => {
    const { meta, links } = seoHead({ siteUrl: SITE_URL, title: "Cards", path: "/cards" });
    expect(links).toEqual([{ rel: "canonical", href: `${SITE_URL}/cards` }]);
    expect(meta).toContainEqual({ property: "og:type", content: "website" });
    expect(meta).toContainEqual({ property: "og:url", content: `${SITE_URL}/cards` });
    expect(meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
    expect(meta.find((m) => "title" in m)?.title).toBe("Cards — OpenRift");
  });

  it("respects custom og:type", () => {
    const { meta } = seoHead({ siteUrl: SITE_URL, title: "Lux", ogType: "product" });
    expect(meta).toContainEqual({ property: "og:type", content: "product" });
  });

  it("strips OG/Twitter and adds robots noindex when noIndex is set", () => {
    const { meta } = seoHead({ siteUrl: SITE_URL, title: "Login", noIndex: true });
    expect(meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    expect(meta.some((m) => "property" in m && m.property === "og:title")).toBe(false);
    expect(meta.some((m) => "name" in m && m.name === "twitter:card")).toBe(false);
  });

  it("does not double-suffix titles already ending in the site name", () => {
    const { meta } = seoHead({ siteUrl: SITE_URL, title: "Card Sets — OpenRift" });
    expect(meta.find((m) => "title" in m)?.title).toBe("Card Sets — OpenRift");
  });
});

describe("websiteJsonLd", () => {
  it("emits a WebSite with a SearchAction targeting /cards", () => {
    const json = parseJsonLd(websiteJsonLd(SITE_URL));
    expect(json["@type"]).toBe("WebSite");
    expect(json.url).toBe(SITE_URL);
    expect(json.potentialAction.target.urlTemplate).toBe(
      `${SITE_URL}/cards?q={search_term_string}`,
    );
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers items starting at 1 and resolves paths against siteUrl", () => {
    const json = parseJsonLd(
      breadcrumbJsonLd(SITE_URL, [
        { name: "Sets", path: "/sets" },
        { name: "Origins", path: "/sets/origins" },
      ]),
    );
    expect(json["@type"]).toBe("BreadcrumbList");
    expect(json.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Sets", item: `${SITE_URL}/sets` },
      {
        "@type": "ListItem",
        position: 2,
        name: "Origins",
        item: `${SITE_URL}/sets/origins`,
      },
    ]);
  });
});

describe("productJsonLd", () => {
  it("omits offers entirely when no price data is available", () => {
    const json = parseJsonLd(
      productJsonLd({
        siteUrl: SITE_URL,
        name: "Lux",
        description: "Lux is a Champion card from Riftbound.",
        url: "/cards/lux",
      }),
    );
    expect(json["@type"]).toBe("Product");
    expect(json.url).toBe(`${SITE_URL}/cards/lux`);
    expect(json.offers).toBeUndefined();
  });

  it("emits a single Offer when low and high prices match", () => {
    const json = parseJsonLd(
      productJsonLd({
        siteUrl: SITE_URL,
        name: "Lux",
        description: "x",
        url: "/cards/lux",
        priceLow: 4.99,
        priceHigh: 4.99,
      }),
    );
    expect(json.offers["@type"]).toBe("Offer");
    expect(json.offers.price).toBe(4.99);
  });

  it("emits an AggregateOffer when prices differ", () => {
    const json = parseJsonLd(
      productJsonLd({
        siteUrl: SITE_URL,
        name: "Lux",
        description: "x",
        url: "/cards/lux",
        priceLow: 1.5,
        priceHigh: 12,
      }),
    );
    expect(json.offers["@type"]).toBe("AggregateOffer");
    expect(json.offers.lowPrice).toBe(1.5);
    expect(json.offers.highPrice).toBe(12);
  });
});

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
        sameAs: ["https://github.com/eikowagenknecht/openrift"],
      }),
    );
    expect(json.sameAs).toEqual(["https://github.com/eikowagenknecht/openrift"]);
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
    // Absolute URLs pass through unchanged.
    expect(json.mainEntity.itemListElement[1].url).toBe("https://cdn.example.com/pg");
  });

  it("caps the inline ItemList but preserves the true total in numberOfItems", () => {
    const items = Array.from({ length: 250 }, (_, i) => ({
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
    expect(json.mainEntity.numberOfItems).toBe(250);
    expect(json.mainEntity.itemListElement).toHaveLength(200);
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
