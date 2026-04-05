import { beforeEach, describe, expect, it, vi } from "vitest";

import { piltoverCodec } from "./piltover.js";
import type { DeckCodecCard } from "./types.js";

// Mock the Piltover library so we can control encode/decode without real binary codes.
vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getCodeFromDeck: vi.fn(() => "MOCK_CODE"),
  getDeckFromCode: vi.fn(),
}));

// oxlint-disable-next-line eslint-plugin-import(first) -- must import after vi.mock
import { getCodeFromDeck, getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
const mockGetCodeFromDeck = vi.mocked(getCodeFromDeck);
const mockGetDeckFromCode = vi.mocked(getDeckFromCode);

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

describe("piltoverCodec.decode", () => {
  it("does not double-count the chosen champion", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [
        { cardCode: "OGN-007", count: 3 },
        { cardCode: "OGN-001", count: 3 },
      ],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const result = piltoverCodec.decode("FAKECODE");

    const championMain = result.cards.find(
      (card) => card.cardCode === "OGN-007" && card.sourceSlot === "mainDeck",
    );
    const championEntry = result.cards.find(
      (card) => card.cardCode === "OGN-007" && card.sourceSlot === "chosenChampion",
    );
    expect(championMain?.count).toBe(2);
    expect(championEntry?.count).toBe(1);
  });

  it("omits mainDeck entry when champion has only 1 copy", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [{ cardCode: "OGN-007", count: 1 }],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const result = piltoverCodec.decode("FAKECODE");

    const mainEntries = result.cards.filter((card) => card.sourceSlot === "mainDeck");
    const championEntries = result.cards.filter((card) => card.sourceSlot === "chosenChampion");
    expect(mainEntries).toHaveLength(0);
    expect(championEntries).toHaveLength(1);
    expect(championEntries[0]?.count).toBe(1);
  });

  it("only subtracts 1 even when library returns multiple entries for the champion", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [
        { cardCode: "OGN-007", count: 2 },
        { cardCode: "OGN-007", count: 1 },
      ],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const result = piltoverCodec.decode("FAKECODE");

    const mainEntries = result.cards.filter(
      (card) => card.cardCode === "OGN-007" && card.sourceSlot === "mainDeck",
    );
    const totalMain = mainEntries.reduce((sum, card) => sum + card.count, 0);
    // (2-1) + 1 = 2 in main, not (2-1) + (1-1) = 1
    expect(totalMain).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// encode
// ---------------------------------------------------------------------------

describe("piltoverCodec.encode", () => {
  beforeEach(() => {
    mockGetCodeFromDeck.mockClear();
  });

  it("includes the champion copy in mainDeck as a single consolidated entry", () => {
    const cards: DeckCodecCard[] = [
      {
        cardId: "uuid-1",
        shortCode: "OGN-007",
        zone: "champion",
        quantity: 1,
        cardType: "Unit",
        superTypes: ["Champion"],
        domains: ["Fury"],
      },
      {
        cardId: "uuid-1",
        shortCode: "OGN-007",
        zone: "main",
        quantity: 2,
        cardType: "Unit",
        superTypes: ["Champion"],
        domains: ["Fury"],
      },
    ];

    piltoverCodec.encode(cards);

    const [mainDeckArg, _sideboardArg, championArg] = mockGetCodeFromDeck.mock.calls[0]!;
    expect(championArg).toBe("OGN-007");

    // Should be a single consolidated entry with count 3 (2 main + 1 champion)
    const mainDeckCards = mainDeckArg as { cardCode: string; count: number }[];
    expect(mainDeckCards).toHaveLength(1);
    expect(mainDeckCards[0]).toEqual({ cardCode: "OGN-007", count: 3 });
  });

  it("adds champion-only card to mainDeck even when no main-zone copies exist", () => {
    const cards: DeckCodecCard[] = [
      {
        cardId: "uuid-1",
        shortCode: "OGN-007",
        zone: "champion",
        quantity: 1,
        cardType: "Unit",
        superTypes: ["Champion"],
        domains: ["Fury"],
      },
    ];

    piltoverCodec.encode(cards);

    const [mainDeckArg, _sideboardArg, championArg] = mockGetCodeFromDeck.mock.calls[0]!;
    expect(championArg).toBe("OGN-007");

    const mainDeckCards = mainDeckArg as { cardCode: string; count: number }[];
    expect(mainDeckCards).toHaveLength(1);
    expect(mainDeckCards[0]).toEqual({ cardCode: "OGN-007", count: 1 });
  });
});
