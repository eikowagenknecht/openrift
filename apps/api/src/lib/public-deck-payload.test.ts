import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
} from "@openrift/shared/response-schemas";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { buildPublicDeckDetail } from "./public-deck-payload.js";
import type { SharedDeckRow } from "./public-deck-payload.js";

const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const TOKEN_CARD_ID = "c0000000-0001-4000-a000-000000000002";
const OTHER_CARD_ID = "c0000000-0001-4000-a000-000000000003";

const DECK: SharedDeckRow = {
  deck: {
    id: "d0000000-0001-4000-a000-000000000001",
    userId: "meta-archive",
    name: "Kennen Tempo",
    description: null,
    format: "constructed",
    formatConfig: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    oddsConfig: null,
    coverCardId: null,
    coverPrintingId: null,
    coverPosition: null,
    links: [],
    isPublic: true,
    shareToken: "tok-1",
    // oxlint-disable-next-line typescript/no-explicit-any -- the row carries columns the payload never reads
  } as any,
  ownerName: "Archive",
  ownerEmail: "archive@example.invalid",
};

const SET = {
  id: "s0000000-0001-4000-a000-000000000001",
  slug: "OGN",
  name: "Origins",
  setType: "main",
  releases: { EN: { releasedAt: "2025-10-31", precision: "day" } },
};

function cardRow(id: string, tokenCardIds: string[] = []) {
  return {
    id,
    name: "Kennen",
    slug: "kennen",
    type: "unit",
    types: ["unit"],
    superTypes: [],
    domains: ["fury"],
    tags: [],
    keywords: [],
    maxCopiesOverride: null,
    mightBonus: null,
    energy: 3,
    might: 2,
    power: 1,
    tokenCardIds,
  };
}

function printingRow(id: string, cardId: string) {
  return {
    id,
    cardId,
    setId: "s0000000-0001-4000-a000-000000000001",
    shortCode: "OGN-202",
    rarity: "rare",
    artVariant: "standard",
    isSigned: false,
    isOvernumbered: false,
    finish: "non-foil",
    size: "standard",
    artist: "Kudos Productions",
    publicCode: "OGN-202/298",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    printedName: null,
    printedYear: 2025,
    language: "EN",
    markerSlugs: [],
    comment: null,
    canonicalRank: 1,
    fallbackArtMode: "auto",
    fallbackImageId: null,
  };
}

/** The `printings` mock returns them all regardless of ids asked for; assert via `printingsByCardIds` call args. */
function repos(options: {
  cards: ReturnType<typeof cardRow>[];
  printings: ReturnType<typeof printingRow>[];
  printingsByCardIds?: ReturnType<typeof vi.fn>;
}): Repos {
  const printingsByCardIds =
    options.printingsByCardIds ?? vi.fn(() => Promise.resolve(options.printings));
  return {
    decks: {
      cardsForDeck: vi.fn(() =>
        Promise.resolve([
          { cardId: CARD_ID, zone: "main", quantity: 3, preferredPrintingId: null },
        ]),
      ),
    },
    deckPlans: { getForDeck: vi.fn(() => Promise.resolve({ plan: null, matchups: [] })) },
    catalog: {
      sets: vi.fn(() => Promise.resolve([SET])),
      cardsByIds: vi.fn(() => Promise.resolve(options.cards)),
      cardBansByCardIds: vi.fn(() => Promise.resolve([])),
      cardErrataByCardIds: vi.fn(() => Promise.resolve([])),
      printingsByCardIds,
      printingImagesByCardIds: vi.fn(() => Promise.resolve([])),
      markersList: vi.fn(() => Promise.resolve([])),
    },
    canonicalPrintings: {
      resolvePrintingMetaForRows: vi.fn(() =>
        Promise.resolve([{ resolvedPrintingId: null, shortCode: null, imageId: null }]),
      ),
    },
    customTags: { assignmentsForCardIds: vi.fn(() => Promise.resolve(new Map())) },
    distributionChannels: {
      listForPrintingIds: vi.fn(() => Promise.resolve([])),
      listAll: vi.fn(() => Promise.resolve([])),
    },
    printingCitations: { listForPrintingIds: vi.fn(() => Promise.resolve([])) },
    // oxlint-disable-next-line typescript/no-explicit-any -- a double of the repos the builder reads
  } as any;
}

describe("buildPublicDeckDetail", () => {
  it("carries every printing of the deck's cards and of the tokens they create", async () => {
    const printingsByCardIds = vi.fn(() =>
      Promise.resolve([
        printingRow("p-1", CARD_ID),
        printingRow("p-2", CARD_ID),
        printingRow("p-3", TOKEN_CARD_ID),
      ]),
    );

    const payload = await buildPublicDeckDetail(
      repos({
        cards: [cardRow(CARD_ID, [TOKEN_CARD_ID])],
        printings: [],
        printingsByCardIds,
      }),
      DECK,
    );

    expect(printingsByCardIds).toHaveBeenCalledWith([CARD_ID, TOKEN_CARD_ID]);
    expect(payload.catalog.printings.map((printing) => printing.id)).toEqual(["p-1", "p-2", "p-3"]);
    expect(payload.catalog.printings[0]).toMatchObject({ cardId: CARD_ID, shortCode: "OGN-202" });
  });

  it("asks for no card the deck does not reference", async () => {
    const printingsByCardIds = vi.fn(() => Promise.resolve([]));

    await buildPublicDeckDetail(
      repos({ cards: [cardRow(CARD_ID)], printings: [], printingsByCardIds }),
      DECK,
    );

    expect(printingsByCardIds).toHaveBeenCalledWith([CARD_ID]);
    expect(printingsByCardIds).not.toHaveBeenCalledWith(expect.arrayContaining([OTHER_CARD_ID]));
  });

  it("hands each printing out in the catalogue's own shape", async () => {
    const payload = await buildPublicDeckDetail(
      repos({ cards: [cardRow(CARD_ID)], printings: [printingRow("p-1", CARD_ID)] }),
      DECK,
    );

    expect(catalogPrintingResponseSchema.safeParse(payload.catalog.printings[0]).success).toBe(
      true,
    );
  });

  it("carries the cards behind the printings and the catalogue's sets", async () => {
    const payload = await buildPublicDeckDetail(
      repos({
        cards: [cardRow(CARD_ID, [TOKEN_CARD_ID]), cardRow(TOKEN_CARD_ID)],
        printings: [printingRow("p-1", CARD_ID), printingRow("p-2", TOKEN_CARD_ID)],
      }),
      DECK,
    );

    expect(Object.keys(payload.catalog.cards)).toEqual([CARD_ID, TOKEN_CARD_ID]);
    expect(catalogCardResponseSchema.safeParse(payload.catalog.cards[CARD_ID]).success).toBe(true);
    expect(payload.catalog.sets.map((set) => set.slug)).toEqual(["OGN"]);
  });
});
