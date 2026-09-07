import { beforeEach, describe, expect, it, vi } from "vitest";

import { piltoverCodec } from "./piltover.js";
import type { DeckCodecCard } from "./types.js";

vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getCodeFromDeck: vi.fn(() => "MOCK_CODE"),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";

const mockGetCodeFromDeck = vi.mocked(getCodeFromDeck);

function card(overrides: Partial<DeckCodecCard>): DeckCodecCard {
  return {
    cardId: "uuid-1",
    shortCode: "OGN-007",
    cardName: "Test Card",
    zone: "main",
    quantity: 1,
    cardType: "unit",
    superTypes: [],
    domains: [],
    preferredPrintingId: null,
    ...overrides,
  };
}

function encodedMainDeck(): { cardCode: string; count: number }[] {
  const [mainDeckArg] = mockGetCodeFromDeck.mock.calls[0]!;
  return mainDeckArg as { cardCode: string; count: number }[];
}

function encodedSideboard(): { cardCode: string; count: number }[] {
  const [, sideboardArg] = mockGetCodeFromDeck.mock.calls[0]!;
  return sideboardArg as { cardCode: string; count: number }[];
}

function encodedChampion(): string | undefined {
  return mockGetCodeFromDeck.mock.calls[0]![2];
}

describe("piltoverCodec.encode", () => {
  beforeEach(() => {
    mockGetCodeFromDeck.mockClear();
  });

  it("includes the champion copy in mainDeck as a single consolidated entry", () => {
    const cards: DeckCodecCard[] = [
      card({ zone: "champion", superTypes: ["champion"], domains: ["fury"] }),
      card({ zone: "main", quantity: 2, superTypes: ["champion"], domains: ["fury"] }),
    ];

    piltoverCodec.encode(cards);

    expect(encodedChampion()).toBe("OGN-007");

    expect(encodedMainDeck()).toEqual([{ cardCode: "OGN-007", count: 3 }]);
  });

  it("adds champion-only card to mainDeck even when no main-zone copies exist", () => {
    const cards: DeckCodecCard[] = [
      card({ zone: "champion", superTypes: ["champion"], domains: ["fury"] }),
    ];

    piltoverCodec.encode(cards);

    expect(encodedChampion()).toBe("OGN-007");
    expect(encodedMainDeck()).toEqual([{ cardCode: "OGN-007", count: 1 }]);
  });

  it("clamps a main-deck count above 12 and warns instead of losing the card", () => {
    const { warnings } = piltoverCodec.encode([
      card({ cardName: "Power Rune", zone: "runes", quantity: 14 }),
    ]);

    expect(encodedMainDeck()).toEqual([{ cardCode: "OGN-007", count: 12 }]);
    expect(warnings).toEqual([
      '"Power Rune": deck codes allow at most 12 copies in the main deck, exported 12 of 14',
    ]);
  });

  it("clamps when the champion copy pushes a full main deck past the cap", () => {
    const { warnings } = piltoverCodec.encode([
      card({ cardName: "Garen", zone: "main", quantity: 12 }),
      card({ cardName: "Garen", zone: "champion" }),
    ]);

    expect(encodedMainDeck()).toEqual([{ cardCode: "OGN-007", count: 12 }]);
    expect(warnings).toEqual([
      '"Garen": deck codes allow at most 12 copies in the main deck, exported 12 of 13',
    ]);
  });

  it("clamps a sideboard count above 3 and warns", () => {
    const { warnings } = piltoverCodec.encode([
      card({ cardName: "Fireball", zone: "sideboard", quantity: 5 }),
    ]);

    expect(encodedSideboard()).toEqual([{ cardCode: "OGN-007", count: 3 }]);
    expect(warnings).toEqual([
      '"Fireball": deck codes allow at most 3 copies in the sideboard, exported 3 of 5',
    ]);
  });

  it("does not warn at exactly the caps", () => {
    const { warnings } = piltoverCodec.encode([
      card({ zone: "main", quantity: 12 }),
      card({ shortCode: "OGN-008", zone: "sideboard", quantity: 3 }),
    ]);

    expect(encodedMainDeck()).toEqual([{ cardCode: "OGN-007", count: 12 }]);
    expect(encodedSideboard()).toEqual([{ cardCode: "OGN-008", count: 3 }]);
    expect(warnings).toEqual([]);
  });
});
