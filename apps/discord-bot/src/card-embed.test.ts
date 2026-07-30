import { describe, expect, it } from "vitest";

import {
  buildCardEmbed,
  cardTextFields,
  describeCard,
  fallbackArtDifferences,
  formatCents,
} from "./card-embed.js";
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

describe("fallbackArtDifferences", () => {
  it("mirrors the site's badge order: language, markers, art variant, signed, finish", () => {
    const printing = makePrinting({
      id: "p-noimg",
      images: [],
      language: "DE",
      markers: [{ id: "m1", slug: "promo", label: "Promo", description: null }],
      artVariant: "altart",
      isSigned: true,
      finish: "metal",
    });
    const artPrinting = makePrinting();
    expect(fallbackArtDifferences(printing, artPrinting, LABELS)).toEqual([
      "EN",
      "Promo",
      "Alt Art",
      "Signed",
      "Metal",
    ]);
  });

  it("returns no tags when the printings only differ by image", () => {
    expect(fallbackArtDifferences(makePrinting({ images: [] }), makePrinting(), LABELS)).toEqual(
      [],
    );
  });
});

describe("cardTextFields", () => {
  const ERRATA = {
    correctedRulesText: "Draw 2.",
    correctedEffectText: null,
    source: "Origins Card Errata",
    sourceUrl: "https://riftbound.example/errata",
    effectiveDate: "2025-10-21",
  };

  it("stacks rules, effect, and flavor text the way the card panel does", () => {
    const fields = cardTextFields(
      makeCard(),
      makePrinting({
        printedRulesText: "Draw 1.",
        printedEffectText: "I have +2 :rb_might:.",
        flavorText: "Bang bang!",
      }),
      new Map(),
    );
    expect(fields).toEqual([
      { name: "Rules text", value: "Draw 1." },
      { name: "Effect text", value: "I have +2 Might." },
      { name: "Flavor text", value: "*Bang bang!*" },
    ]);
  });

  it("renders glyphs with the app's emojis when it has them", () => {
    const fields = cardTextFields(
      makeCard(),
      makePrinting({ printedRulesText: "Pay :rb_energy_1:." }),
      new Map([["energy_1", "<:rb_energy_1:2>"]]),
    );
    expect(fields[0]?.value).toBe("Pay <:rb_energy_1:2>.");
  });

  it("shows the errata text with a linked credit instead of the printed text", () => {
    const fields = cardTextFields(
      makeCard({ errata: ERRATA }),
      makePrinting({ printedRulesText: "Draw 1." }),
      new Map(),
    );
    expect(fields[0]?.value).toBe(
      "Draw 2.\n*Errata ([Origins Card Errata, 2025-10](https://riftbound.example/errata))*",
    );
  });

  it("omits the credit when the errata matches what was printed", () => {
    const fields = cardTextFields(
      makeCard({ errata: ERRATA }),
      makePrinting({ printedRulesText: "Draw 2." }),
      new Map(),
    );
    expect(fields[0]?.value).toBe("Draw 2.");
  });

  it("puts the might bonus in the effect field, as the panel does", () => {
    const fields = cardTextFields(makeCard({ mightBonus: 2 }), makePrinting(), new Map());
    expect(fields).toEqual([{ name: "Effect text", value: "**Might bonus** +2" }]);
  });

  it("returns nothing for a card with no text and no printing", () => {
    expect(cardTextFields(makeCard(), undefined, new Map())).toEqual([]);
  });

  it("truncates a text block past Discord's field limit", () => {
    const fields = cardTextFields(
      makeCard(),
      makePrinting({ printedRulesText: "a".repeat(1200) }),
      new Map(),
    );
    expect(fields[0]?.value).toHaveLength(1024);
    expect(fields[0]?.value.endsWith("…")).toBe(true);
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

  it("puts the card text above the price fields", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse([makeCard()], [makePrinting({ printedRulesText: "Draw 1." })]),
      makePricesResponse({ "printing-1": { tcgplayer: 452 } }),
      makeInitResponse(),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.fields?.map((f) => f.name)).toEqual(["Rules text", "TCGplayer"]);
    expect(embed.fields?.[0]?.inline).toBeUndefined();
  });

  it("names the variant in the footer when the card has same-code siblings", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard()],
        [
          makePrinting({ id: "printing-1", canonicalRank: 1 }),
          makePrinting({ id: "printing-2", canonicalRank: 2, finish: "foil" }),
        ],
      ),
      makePricesResponse(),
      makeInitResponse(),
    );
    const printings = snapshot.printingsByCardId.get("card-1")!;
    const footer = (printing: (typeof printings)[number]) =>
      buildCardEmbed({ card: snapshot.cards[0]!, printing, snapshot, siteUrl: SITE }).footer?.text;
    expect(footer(printings[0]!)).toBe("OGN-202/298 · Origins · Standard");
    expect(footer(printings[1]!)).toBe("OGN-202/298 · Origins · Foil");
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

  it("shows standard-printing artwork for a printing without an image", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard()],
        [
          makePrinting({ id: "p-standard", canonicalRank: 1 }),
          makePrinting({ id: "p-noimg", canonicalRank: 2, images: [], isSigned: true }),
        ],
      ),
      makePricesResponse(),
      makeInitResponse(),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")!.find((p) => p.id === "p-noimg"),
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.image?.url).toBe(`${SITE}/media/cards/aa/0197f00d00aa-full.webp`);
    expect(embed.description).toContain("*Standard-printing artwork shown (differs: Signed)*");
  });

  it("notes the substitution without tags when nothing differs", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard()],
        [
          makePrinting({ id: "p-standard", canonicalRank: 1 }),
          makePrinting({ id: "p-noimg", canonicalRank: 2, images: [] }),
        ],
      ),
      makePricesResponse(),
      makeInitResponse(),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")!.find((p) => p.id === "p-noimg"),
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.image?.url).toBe(`${SITE}/media/cards/aa/0197f00d00aa-full.webp`);
    expect(embed.description).toContain("*Standard-printing artwork shown*");
    expect(embed.description).not.toContain("differs");
  });

  it("omits image and note when no standard printing has an image", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse([makeCard()], [makePrinting({ id: "p-noimg", images: [] })]),
      makePricesResponse(),
      makeInitResponse(),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.image).toBeUndefined();
    expect(embed.description).not.toContain("artwork");
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
