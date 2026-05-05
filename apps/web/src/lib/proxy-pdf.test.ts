import type {
  CatalogResponse,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
} from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { sortCardsLikeSidebar } from "@/lib/deck-card-order";
import { resolveProxyCards } from "@/lib/proxy-pdf";
import { resetIdCounter, stubCard, stubDeckBuilderCard, stubPrinting } from "@/test/factories";

function stubSet(overrides: Partial<CatalogSetResponse> = {}): CatalogSetResponse {
  return {
    id: overrides.id ?? "set-en-first",
    slug: overrides.slug ?? "rb1",
    name: overrides.name ?? "Origins",
    releasedAt: overrides.releasedAt ?? "2024-01-01",
    released: overrides.released ?? true,
    setType: overrides.setType ?? "main",
  };
}

function toCatalogPrinting(
  printing: ReturnType<typeof stubPrinting>,
): CatalogResponsePrintingValue {
  const { id: _id, card: _card, setSlug: _setSlug, setReleased: _setReleased, ...rest } = printing;
  return rest;
}

function buildCatalog(
  sets: CatalogSetResponse[],
  printings: ReturnType<typeof stubPrinting>[],
): CatalogResponse {
  return {
    sets,
    cards: Object.fromEntries(
      printings.map((p) => {
        const { slug: _slug, ...cardWithoutSlug } = p.card;
        return [p.cardId, { slug: p.card.slug, ...cardWithoutSlug }];
      }),
    ),
    printings: Object.fromEntries(printings.map((p) => [p.id, toCatalogPrinting(p)])),
    totalCopies: printings.length,
  };
}

describe("resolveProxyCards", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("uses the printing pinned via preferredPrintingId", () => {
    const card = stubCard({ slug: "RB1-001", name: "Test Card" });
    const enPrinting = stubPrinting({
      cardId: "card-1",
      setId: "set-1",
      shortCode: "RB1-001",
      language: "EN",
      images: [{ face: "front", imageId: "en-image-id-aa" }],
      card,
    });
    const zhPrinting = stubPrinting({
      cardId: "card-1",
      setId: "set-1",
      shortCode: "RB1-001",
      language: "zh-Hans",
      images: [{ face: "front", imageId: "zh-image-id-bb" }],
      card,
    });
    const catalog = buildCatalog([stubSet({ id: "set-1" })], [enPrinting, zhPrinting]);
    const deckCards = [
      stubDeckBuilderCard({ cardId: "card-1", preferredPrintingId: zhPrinting.id }),
    ];

    const proxies = resolveProxyCards(deckCards, catalog, ["EN"]);

    expect(proxies).toHaveLength(1);
    expect(proxies[0].printingId).toBe(zhPrinting.id);
    expect(proxies[0].imageFullUrl).toBe("/media/cards/bb/zh-image-id-bb-full.webp");
  });

  it("respects the user language preference when no printing is pinned", () => {
    const card = stubCard({ slug: "RB1-002", name: "Lang Sensitive" });
    // Insert non-EN printings first to defeat any DB-order fallback.
    const zhPrinting = stubPrinting({
      cardId: "card-2",
      setId: "set-2",
      shortCode: "RB1-002",
      language: "zh-Hans",
      images: [{ face: "front", imageId: "zh-image-id-bb" }],
      card,
    });
    const jaPrinting = stubPrinting({
      cardId: "card-2",
      setId: "set-2",
      shortCode: "RB1-002",
      language: "ja",
      images: [{ face: "front", imageId: "ja-image-id-cc" }],
      card,
    });
    const enPrinting = stubPrinting({
      cardId: "card-2",
      setId: "set-2",
      shortCode: "RB1-002",
      language: "EN",
      images: [{ face: "front", imageId: "en-image-id-aa" }],
      card,
    });
    const catalog = buildCatalog([stubSet({ id: "set-2" })], [zhPrinting, jaPrinting, enPrinting]);
    const deckCards = [stubDeckBuilderCard({ cardId: "card-2", preferredPrintingId: null })];

    const proxies = resolveProxyCards(deckCards, catalog, ["EN"]);

    expect(proxies[0].printingId).toBe(enPrinting.id);
    expect(proxies[0].imageFullUrl).toBe("/media/cards/aa/en-image-id-aa-full.webp");
  });

  it("emits distinct printingIds for two deck rows pinned to different printings of the same card", () => {
    const card = stubCard({ slug: "RB1-003", name: "Twin" });
    const enPrinting = stubPrinting({
      cardId: "card-3",
      setId: "set-3",
      shortCode: "RB1-003",
      language: "EN",
      images: [{ face: "front", imageId: "en-image-id-aa" }],
      card,
    });
    const zhPrinting = stubPrinting({
      cardId: "card-3",
      setId: "set-3",
      shortCode: "RB1-003",
      language: "zh-Hans",
      images: [{ face: "front", imageId: "zh-image-id-bb" }],
      card,
    });
    const catalog = buildCatalog([stubSet({ id: "set-3" })], [enPrinting, zhPrinting]);
    const deckCards = [
      stubDeckBuilderCard({
        cardId: "card-3",
        zone: "main",
        quantity: 2,
        preferredPrintingId: enPrinting.id,
      }),
      stubDeckBuilderCard({
        cardId: "card-3",
        zone: "sideboard",
        quantity: 1,
        preferredPrintingId: zhPrinting.id,
      }),
    ];

    const proxies = resolveProxyCards(deckCards, catalog, ["EN"]);

    expect(proxies).toHaveLength(3);
    expect(proxies.slice(0, 2).map((p) => p.printingId)).toEqual([enPrinting.id, enPrinting.id]);
    expect(proxies.slice(0, 2).map((p) => p.imageFullUrl)).toEqual([
      "/media/cards/aa/en-image-id-aa-full.webp",
      "/media/cards/aa/en-image-id-aa-full.webp",
    ]);
    expect(proxies[2].printingId).toBe(zhPrinting.id);
    expect(proxies[2].imageFullUrl).toBe("/media/cards/bb/zh-image-id-bb-full.webp");
  });

  it("composes with sortCardsLikeSidebar to print cards in sidebar order", () => {
    const legend = stubCard({ slug: "RB1-L", name: "legend", type: "legend" });
    const mainSpell = stubCard({ slug: "RB1-S", name: "Bolt", type: "spell", energy: 1 });
    const mainUnit = stubCard({ slug: "RB1-U", name: "Warrior", type: "unit", energy: 3 });
    const printings = [
      stubPrinting({ cardId: "card-legend", setId: "set-o", card: legend }),
      stubPrinting({ cardId: "card-spell", setId: "set-o", card: mainSpell }),
      stubPrinting({ cardId: "card-unit", setId: "set-o", card: mainUnit }),
    ];
    const catalog = buildCatalog([stubSet({ id: "set-o" })], printings);
    const zoneOrder = [
      "legend",
      "champion",
      "main",
      "battlefield",
      "runes",
      "sideboard",
      "overflow",
    ] as const;

    // Deliberately jumbled: main Spell, then Legend, then main Unit.
    const deckCards = [
      stubDeckBuilderCard({
        cardId: "card-spell",
        zone: "main",
        cardType: "spell",
        energy: 1,
        cardName: "Bolt",
      }),
      stubDeckBuilderCard({
        cardId: "card-legend",
        zone: "legend",
        cardType: "legend",
        cardName: "legend",
      }),
      stubDeckBuilderCard({
        cardId: "card-unit",
        zone: "main",
        cardType: "unit",
        energy: 3,
        cardName: "Warrior",
      }),
    ];

    const ordered = sortCardsLikeSidebar(deckCards, [...zoneOrder]);
    const proxies = resolveProxyCards(ordered, catalog, ["EN"]);

    expect(proxies.map((p) => p.name)).toEqual(["legend", "Warrior", "Bolt"]);
  });
});
