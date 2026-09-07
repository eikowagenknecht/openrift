import { describe, expect, it } from "vitest";

import {
  buildCardEmbed,
  cardTextFields,
  cardWarnings,
  fallbackArtDifferences,
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

describe("fallbackArtDifferences", () => {
  it("mirrors the site's badge order: language, markers, art variant, overnumbered, signed, finish", () => {
    const printing = makePrinting({
      id: "p-noimg",
      images: [],
      language: "DE",
      markers: [{ id: "m1", slug: "promo", label: "Promo", description: null }],
      artVariant: "altart",
      isOvernumbered: true,
      isSigned: true,
      finish: "metal",
    });
    const artPrinting = makePrinting();
    expect(fallbackArtDifferences(printing, artPrinting, LABELS)).toEqual([
      "EN",
      "Promo",
      "Alt Art",
      "Overnumbered",
      "Signed",
      "Metal",
    ]);
  });

  it("returns no tags when the printings only differ by image", () => {
    expect(fallbackArtDifferences(makePrinting({ images: [] }), makePrinting(), LABELS)).toEqual(
      [],
    );
  });

  it("drops the language tag when the art has no printing behind it", () => {
    const printing = makePrinting({ images: [], language: "DE", isSigned: true });
    expect(fallbackArtDifferences(printing, null, LABELS)).toEqual(["Signed"]);
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

  it("stacks rules and effect text the way the card panel does, without the flavor text", () => {
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
    ]);
  });

  it("returns nothing for a card whose only text is flavor text", () => {
    expect(
      cardTextFields(makeCard(), makePrinting({ flavorText: "Bang bang!" }), new Map()),
    ).toEqual([]);
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

  it("leaves the stat line and the card text to the details, keeping the embed compact", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard()],
        [makePrinting({ printedRulesText: "Draw 1.", flavorText: "Bang bang!" })],
      ),
      makePricesResponse({ "printing-1": { tcgplayer: 452 } }),
      makeInitResponse(),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.fields?.map((f) => f.name)).toEqual(["TCGplayer"]);
    expect(embed.description).toBeUndefined();
  });

  it("keeps the ban and errata warnings above the fold, since the artwork can't show them", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [
          makeCard({
            bans: [
              {
                formatId: "f1",
                formatName: "Standard",
                bannedAt: "2026-01-05",
                reason: "Too fast",
              },
            ],
            errata: {
              correctedRulesText: "Draw 2.",
              correctedEffectText: null,
              source: "Origins Card Errata",
              sourceUrl: "https://riftbound.example/errata",
              effectiveDate: "2025-10-21",
            },
          }),
        ],
        [makePrinting({ printedRulesText: "Draw 1." })],
      ),
      makePricesResponse(),
      makeInitResponse(),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.description).toBe(
      "🚫 **Banned** in Standard\n" +
        "⚠️ **Errata** ([Origins Card Errata, 2025-10](https://riftbound.example/errata))",
    );
  });

  it("names every format a card is banned in", () => {
    const card = makeCard({
      bans: [
        { formatId: "f1", formatName: "Standard", bannedAt: "2026-01-05", reason: null },
        { formatId: "f2", formatName: "Ranked", bannedAt: "2026-02-01", reason: null },
      ],
    });
    expect(cardWarnings(card)).toEqual(["🚫 **Banned** in Standard, Ranked"]);
  });

  it("keeps the errata warning unlinked when the errata has no source URL", () => {
    const card = makeCard({
      errata: {
        correctedRulesText: "Draw 2.",
        correctedEffectText: null,
        source: "Origins Card Errata",
        sourceUrl: null,
        effectiveDate: null,
      },
    });
    expect(cardWarnings(card)).toEqual(["⚠️ **Errata** (Origins Card Errata)"]);
  });

  it("puts the tradelist field above the prices", () => {
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
      tradelists: {
        groupName: "Summoner Skirmish",
        holders: [
          {
            userName: "Alice",
            quantity: 2,
            printings: [{ printingId: "printing-1", quantity: 2, listNames: ["Binder"] }],
          },
          {
            userName: null,
            quantity: 1,
            printings: [{ printingId: "printing-1", quantity: 1, listNames: ["Binder", "Trades"] }],
          },
        ],
      },
    });
    expect(embed.fields?.map((f) => f.name)).toEqual([
      "On tradelists in Summoner Skirmish",
      "TCGplayer",
    ]);
    expect(embed.fields?.[0]?.value).toBe(
      [
        "Alice · 2×",
        "-# OGN-202/298 2× (Binder)",
        "Unknown user · 1×",
        "-# OGN-202/298 1× (Binder, Trades)",
      ].join("\n"),
    );
  });

  it("names each printing in the holder breakdown, dropping a repeated code", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard()],
        [
          makePrinting({ id: "printing-1", canonicalRank: 1 }),
          makePrinting({ id: "printing-2", canonicalRank: 2, artVariant: "altart" }),
        ],
      ),
      makePricesResponse(),
      makeInitResponse(),
    );
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
      tradelists: {
        groupName: "Summoner Skirmish",
        holders: [
          {
            userName: "Mira",
            quantity: 2,
            // Deliberately out of canonical order.
            printings: [
              { printingId: "printing-2", quantity: 1, listNames: ["Trades"] },
              { printingId: "printing-1", quantity: 1, listNames: ["Binder"] },
            ],
          },
        ],
      },
    });
    const field = embed.fields?.find((f) => f.name.startsWith("On tradelists"));
    expect(field?.value).toBe(
      "Mira · 2×\n-# OGN-202/298 Standard 1× (Binder) · Alt Art 1× (Trades)",
    );
  });

  it("keeps an unknown printing in the breakdown and caps long ones", () => {
    const snapshot = snapshotWithPrices();
    const embed = buildCardEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
      tradelists: {
        groupName: null,
        holders: [
          {
            userName: "Mira",
            quantity: 7,
            printings: [
              { printingId: "printing-1", quantity: 1, listNames: ["Binder"] },
              ...Array.from({ length: 6 }, (_, index) => ({
                printingId: `printing-unknown-${index}`,
                quantity: 1,
                listNames: [],
              })),
            ],
          },
        ],
      },
    });
    const field = embed.fields?.find((f) => f.name === "On tradelists");
    expect(field?.value).toBe(
      "Mira · 7×\n-# OGN-202/298 1× (Binder) · Unknown printing 1× · " +
        "Unknown printing 1× · Unknown printing 1× · Unknown printing 1× · +2 more",
    );
  });

  it("collapses long holder lists and omits the field when there is nothing to show", () => {
    const snapshot = snapshotWithPrices();
    const base = {
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    };
    const many = buildCardEmbed({
      ...base,
      tradelists: {
        groupName: null,
        holders: Array.from({ length: 7 }, (_, i) => ({
          userName: `U${i}`,
          quantity: 1,
          printings: [{ printingId: "printing-1", quantity: 1, listNames: ["Binder"] }],
        })),
      },
    });
    const field = many.fields?.find((f) => f.name === "On tradelists");
    expect(field?.value.endsWith("…and 2 more")).toBe(true);

    const withoutHolders = buildCardEmbed({
      ...base,
      tradelists: { groupName: "Empty", holders: [] },
    });
    expect(withoutHolders.fields?.some((f) => f.name.startsWith("On tradelists")) ?? false).toBe(
      false,
    );
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
    expect(embed.description).toBe("*Standard-printing artwork shown*");
  });

  it("words the note generically for pinned substitute art", () => {
    const snapshot = buildSnapshot(
      makeCatalogResponse(
        [makeCard()],
        [
          makePrinting({ id: "p-standard", canonicalRank: 1 }),
          makePrinting({
            id: "p-noimg",
            canonicalRank: 2,
            images: [],
            fallbackArtMode: "pinned",
            fallbackImageId: "0197f00d00aa",
          }),
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
    expect(embed.description).toBe("*Substitute artwork shown*");
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
    expect(embed.description).toBeUndefined();
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
