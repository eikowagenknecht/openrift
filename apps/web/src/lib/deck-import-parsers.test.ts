import { describe, expect, it, vi } from "vitest";

import { parseDeckImportData } from "./deck-import-parsers";

// Mock the Piltover library — we control what getDeckFromCode returns so we can
// test our deduplication logic without depending on real binary deck codes.
vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getDeckFromCode: vi.fn(),
}));

// oxlint-disable-next-line eslint-plugin-import(first) -- must import after vi.mock
import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
const mockGetDeckFromCode = vi.mocked(getDeckFromCode);

describe("parseDeckImportData — piltover format", () => {
  it("does not double-count the chosen champion", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [
        { cardCode: "OGN-007", count: 3 },
        { cardCode: "OGN-001", count: 3 },
      ],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const { entries } = parseDeckImportData("FAKECODE", "piltover");

    // Champion card: 2 in mainDeck + 1 in chosenChampion = 3 total (not 4)
    const championMain = entries.find(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "mainDeck",
    );
    const championEntry = entries.find(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "chosenChampion",
    );
    expect(championMain?.quantity).toBe(2);
    expect(championEntry?.quantity).toBe(1);

    // Non-champion card is unaffected
    const normalCard = entries.find(
      (entry) => entry.shortCode === "OGN-001" && entry.sourceSlot === "mainDeck",
    );
    expect(normalCard?.quantity).toBe(3);
  });

  it("omits the mainDeck entry when champion has only 1 copy", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [
        { cardCode: "OGN-007", count: 1 },
        { cardCode: "OGN-001", count: 3 },
      ],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const { entries } = parseDeckImportData("FAKECODE", "piltover");

    // Only the chosenChampion entry should exist — no mainDeck entry with 0 copies
    const championMain = entries.find(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "mainDeck",
    );
    const championEntry = entries.find(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "chosenChampion",
    );
    expect(championMain).toBeUndefined();
    expect(championEntry?.quantity).toBe(1);
  });

  it("only subtracts 1 even when library returns multiple entries for the champion", () => {
    // The library can return the same card at different count levels
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [
        { cardCode: "OGN-007", count: 2 },
        { cardCode: "OGN-007", count: 1 },
      ],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const { entries } = parseDeckImportData("FAKECODE", "piltover");

    // Should subtract 1 from the first entry only: (2-1) + 1 = 2 in main
    const mainEntries = entries.filter(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "mainDeck",
    );
    const totalMain = mainEntries.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(totalMain).toBe(2);

    const championEntry = entries.find(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "chosenChampion",
    );
    expect(championEntry?.quantity).toBe(1);
  });

  it("handles decks with no chosen champion", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [{ cardCode: "OGN-001", count: 3 }],
      sideboard: [{ cardCode: "OGN-002", count: 1 }],
      chosenChampion: undefined,
    });

    const { entries } = parseDeckImportData("FAKECODE", "piltover");

    expect(entries).toHaveLength(2);
    expect(entries[0]?.quantity).toBe(3);
    expect(entries[0]?.sourceSlot).toBe("mainDeck");
    expect(entries[1]?.quantity).toBe(1);
    expect(entries[1]?.sourceSlot).toBe("sideboard");
  });
});
