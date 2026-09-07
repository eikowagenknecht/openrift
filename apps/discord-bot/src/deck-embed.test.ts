import type { DeckImportEntry } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import { buildSnapshot } from "./catalog-cache.js";
import {
  buildDeckEmbed,
  deckImportUrl,
  deckTitle,
  fetchDeckImage,
  resolveDeckEntries,
} from "./deck-embed.js";
import {
  makeCard,
  makeCatalogResponse,
  makeInitResponse,
  makePricesResponse,
  makePrinting,
} from "./test/factories.js";

function makeDeckSnapshot() {
  const cards = [
    makeCard({
      id: "c-legend",
      name: "Emperor of the Sands",
      type: "legend",
      types: ["legend"],
      superTypes: [],
      tags: ["Azir"],
    }),
    makeCard({ id: "c-champ", name: "Jinx, Rebel" }),
    makeCard({ id: "c-unit", name: "Iron Ballista", superTypes: [] }),
    makeCard({ id: "c-rune", name: "Fury Rune", type: "rune", types: ["rune"], superTypes: [] }),
    makeCard({
      id: "c-bf",
      name: "Sunken Temple",
      type: "battlefield",
      types: ["battlefield"],
      superTypes: [],
    }),
  ];
  const printings = [
    makePrinting({ id: "p-legend", cardId: "c-legend", shortCode: "OGN-003" }),
    makePrinting({ id: "p-champ", cardId: "c-champ", shortCode: "OGN-007" }),
    makePrinting({ id: "p-unit", cardId: "c-unit", shortCode: "OGN-100" }),
    makePrinting({ id: "p-rune", cardId: "c-rune", shortCode: "OGN-200" }),
    makePrinting({ id: "p-bf", cardId: "c-bf", shortCode: "OGN-220" }),
  ];
  return buildSnapshot(
    makeCatalogResponse(cards, printings),
    makePricesResponse(),
    makeInitResponse(),
  );
}

function makeEntry(overrides: Partial<DeckImportEntry> = {}): DeckImportEntry {
  return {
    shortCode: "OGN-100",
    quantity: 3,
    sourceSlot: "mainDeck",
    rawFields: {},
    ...overrides,
  };
}

describe("resolveDeckEntries", () => {
  it("resolves short codes to cards and printings, inferring zones", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [
      makeEntry({ shortCode: "OGN-003", quantity: 1 }),
      makeEntry({ shortCode: "OGN-100", quantity: 3 }),
      makeEntry({ shortCode: "OGN-200", quantity: 2 }),
      makeEntry({ shortCode: "OGN-220", quantity: 1 }),
    ]);

    expect(deck.unknownCodes).toEqual([]);
    expect(deck.totalCards).toBe(7);
    expect(deck.rows.map((row) => [row.card.name, row.zone])).toEqual([
      ["Emperor of the Sands", "legend"],
      ["Iron Ballista", "main"],
      ["Fury Rune", "runes"],
      ["Sunken Temple", "battlefield"],
    ]);
    expect(deck.rows[1]!.printing.id).toBe("p-unit");
  });

  it("prefers the entry's explicit zone over inference", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [
      makeEntry({
        shortCode: "OGN-007",
        quantity: 1,
        sourceSlot: "chosenChampion",
        explicitZone: "champion",
      }),
    ]);

    expect(deck.rows[0]!.zone).toBe("champion");
  });

  it("matches short codes case-insensitively", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [makeEntry({ shortCode: "ogn-100", quantity: 2 })]);

    expect(deck.rows).toHaveLength(1);
    expect(deck.rows[0]!.card.name).toBe("Iron Ballista");
  });

  it("collects unknown short codes without dropping the rest", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [
      makeEntry({ shortCode: "OGN-100", quantity: 3 }),
      makeEntry({ shortCode: "XXX-999", quantity: 4, sourceSlot: "sideboard" }),
    ]);

    expect(deck.rows).toHaveLength(1);
    expect(deck.unknownCodes).toEqual(["XXX-999"]);
    expect(deck.totalCards).toBe(3);
  });
});

describe("deckTitle", () => {
  it("uses the legend's colloquial display name", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [
      makeEntry({ shortCode: "OGN-003", quantity: 1 }),
      makeEntry({ shortCode: "OGN-100", quantity: 3 }),
    ]);

    expect(deckTitle(deck)).toBe("Azir, Emperor of the Sands");
  });

  it("falls back to the chosen champion, then a generic label", () => {
    const snapshot = makeDeckSnapshot();
    const championDeck = resolveDeckEntries(snapshot, [
      makeEntry({
        shortCode: "OGN-007",
        quantity: 1,
        sourceSlot: "chosenChampion",
        explicitZone: "champion",
      }),
    ]);
    expect(deckTitle(championDeck)).toBe("Jinx, Rebel");

    const plainDeck = resolveDeckEntries(snapshot, [makeEntry()]);
    expect(deckTitle(plainDeck)).toBe("Riftbound Deck");
  });
});

describe("buildDeckEmbed", () => {
  it("groups the decklist by zone in the site's zone order", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [
      makeEntry({ shortCode: "OGN-100", quantity: 3 }),
      makeEntry({ shortCode: "OGN-003", quantity: 1 }),
      makeEntry({ shortCode: "OGN-200", quantity: 2 }),
    ]);

    const embed = buildDeckEmbed({
      deck,
      code: "TESTCODE",
      snapshot,
      siteUrl: "https://openrift.app",
    });

    expect(embed.description).toBe(
      "**Legend**\n1× Emperor of the Sands\n\n**Runes**\n2× Fury Rune\n\n**Main Deck**\n3× Iron Ballista",
    );
  });

  it("links to the import page with the code prefilled", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [makeEntry()]);

    const embed = buildDeckEmbed({
      deck,
      code: "TEST+CODE",
      snapshot,
      siteUrl: "https://openrift.app",
    });

    expect(embed.url).toBe("https://openrift.app/decks/import?code=TEST%2BCODE");
    expect(embed.footer?.text).toBe("3 cards");
  });

  it("URL-encodes the code in the import deep link", () => {
    expect(deckImportUrl("https://openrift.app", "TEST+CODE=")).toBe(
      "https://openrift.app/decks/import?code=TEST%2BCODE%3D",
    );
  });

  it("notes unknown codes and references the attached image", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [
      makeEntry(),
      makeEntry({ shortCode: "XXX-999", quantity: 1 }),
    ]);

    const embed = buildDeckEmbed({
      deck,
      code: "TESTCODE",
      snapshot,
      siteUrl: "https://openrift.app",
      imageAttachmentName: "deck.png",
    });

    expect(embed.description).toContain("1 card not in the catalog yet: XXX-999");
    expect(embed.image?.url).toBe("attachment://deck.png");
  });

  it("caps the description at Discord's limit", () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [makeEntry()]);
    deck.unknownCodes.push(...Array.from({ length: 600 }, (_, i) => `XXX-${String(i)}`));

    const embed = buildDeckEmbed({
      deck,
      code: "TESTCODE",
      snapshot,
      siteUrl: "https://openrift.app",
    });

    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    expect(embed.description?.endsWith("…")).toBe(true);
  });
});

describe("fetchDeckImage", () => {
  it("posts the resolved rows and returns the PNG bytes", async () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [
      makeEntry({ shortCode: "OGN-003", quantity: 1 }),
      makeEntry({ shortCode: "OGN-100", quantity: 3 }),
    ]);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    });

    const image = await fetchDeckImage(
      "http://api:3000",
      deck,
      fetchImpl as unknown as typeof fetch,
    );

    expect(image).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api:3000/api/v1/decks/image");
    expect(JSON.parse(init.body)).toEqual({
      deckName: "Azir, Emperor of the Sands",
      cards: [
        { cardId: "c-legend", preferredPrintingId: "p-legend", quantity: 1, zone: "legend" },
        { cardId: "c-unit", preferredPrintingId: "p-unit", quantity: 3, zone: "main" },
      ],
    });
  });

  it("returns null on a non-OK response", async () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [makeEntry()]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    expect(
      await fetchDeckImage("http://api:3000", deck, fetchImpl as unknown as typeof fetch),
    ).toBeNull();
  });

  it("returns null when the request throws", async () => {
    const snapshot = makeDeckSnapshot();
    const deck = resolveDeckEntries(snapshot, [makeEntry()]);
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connection refused"));

    expect(
      await fetchDeckImage("http://api:3000", deck, fetchImpl as unknown as typeof fetch),
    ).toBeNull();
  });
});
