import { beforeEach, describe, expect, it, vi } from "vitest";

import { piltoverCodec } from "./piltover.js";
import type { DeckCodecCard } from "./types.js";

// Mock the Piltover library so we can control encoding without real binary codes.
vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getCodeFromDeck: vi.fn(() => "MOCK_CODE"),
}));

// oxlint-disable-next-line eslint-plugin-import(first) -- must import after vi.mock
import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";
const mockGetCodeFromDeck = vi.mocked(getCodeFromDeck);

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
