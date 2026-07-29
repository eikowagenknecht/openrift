import { describe, expect, it } from "vitest";

import { buildCardEmbed, describeCard, formatCents } from "./card-embed.js";
import { buildSnapshot } from "./catalog-cache.js";
import {
  makeCard,
  makeCatalogResponse,
  makeInitResponse,
  makePricesResponse,
  makePrinting,
} from "./test/factories.js";

const SITE = "https://openrift.example";

function snapshotWithPrices(prices = makePricesResponse()) {
  return buildSnapshot(
    makeCatalogResponse([makeCard()], [makePrinting()]),
    prices,
    makeInitResponse(),
  );
}

const LABELS = snapshotWithPrices().labels;

describe("formatCents", () => {
  it("formats USD cents", () => {
    expect(formatCents(452, "USD")).toBe("$4.52");
  });

  it("formats EUR cents", () => {
    expect(formatCents(380, "EUR")).toBe("€3.80");
  });
});

describe("describeCard", () => {
  it("renders display labels for the catalog's type and domain slugs", () => {
    expect(describeCard(makeCard(), LABELS)).toBe("Champion Unit · Chaos · Energy 5 · Might 5");
  });

  it("omits null stats and empty domains", () => {
    const card = makeCard({ superTypes: [], domains: [], might: null, energy: null, power: null });
    expect(describeCard(card, LABELS)).toBe("Unit");
  });

  it("includes power when present", () => {
    expect(describeCard(makeCard({ power: 2 }), LABELS)).toContain("Power 2");
  });

  it("joins multiple domains with their labels", () => {
    expect(describeCard(makeCard({ domains: ["chaos", "fury"] }), LABELS)).toContain(
      "Chaos / Fury",
    );
  });
});

describe("buildCardEmbed", () => {
  it("links the title to the card page and embeds the front image", () => {
    const snapshot = snapshotWithPrices();
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.title).toBe("Jinx, Rebel");
    expect(embed.url).toBe(`${SITE}/cards/jinx-rebel`);
    expect(embed.image?.url).toBe(`${SITE}/media/cards/aa/0197f00d00aa-full.webp`);
    expect(embed.footer?.text).toBe("OGN-202/298 · Origins");
  });

  it("adds one inline price field per priced marketplace, in site order", () => {
    const snapshot = snapshotWithPrices(
      makePricesResponse({ "printing-1": { cardmarket: 380, tcgplayer: 452 } }),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.fields?.map((f) => f.name)).toEqual(["TCGplayer", "Cardmarket"]);
    expect(embed.fields?.[0]?.value).toContain("$4.52");
    expect(embed.fields?.[1]?.value).toContain("€3.80");
  });

  it("links prices to the affiliate product page when a product mapping exists", () => {
    const snapshot = snapshotWithPrices(
      makePricesResponse({ "printing-1": { tcgplayer: 452, cardtrader: 390 } }),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      marketplaceInfo: {
        tcgplayer: { available: true, productId: 582_391 },
        cardmarket: { available: false, productId: null },
        cardtrader: { available: true, productId: 99 },
      },
      siteUrl: SITE,
    });
    expect(embed.fields?.[0]?.value).toContain(
      "partner.tcgplayer.com/openrift?u=https%3A%2F%2Fwww.tcgplayer.com%2Fproduct%2F582391",
    );
    expect(embed.fields?.[1]?.value).toContain("share_code=openrift");
  });

  it("falls back to marketplace search links when no product mapping exists", () => {
    const snapshot = snapshotWithPrices(makePricesResponse({ "printing-1": { cardmarket: 380 } }));
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.fields?.[0]?.value).toContain("Products/Search?searchString=Jinx%2C%20Rebel");
  });

  it("omits price fields, image, and footer when data is missing", () => {
    const snapshot = snapshotWithPrices();
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: undefined,
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.fields).toBeUndefined();
    expect(embed.image).toBeUndefined();
    expect(embed.footer).toBeUndefined();
    expect(embed.url).toBe(`${SITE}/cards/jinx-rebel`);
  });
});
