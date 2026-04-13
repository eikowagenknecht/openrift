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
    expect(championMain?.explicitZone).toBeUndefined();
    expect(championEntry?.quantity).toBe(1);
    expect(championEntry?.explicitZone).toBe("champion");

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
    expect(championEntry?.explicitZone).toBe("champion");
  });

  it("consolidates duplicate mainDeck entries and subtracts 1 for champion", () => {
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

    // Consolidated total is 3, minus 1 for champion = 2 in a single main entry
    const mainEntries = entries.filter(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "mainDeck",
    );
    expect(mainEntries).toHaveLength(1);
    expect(mainEntries[0].quantity).toBe(2);

    const championEntry = entries.find(
      (entry) => entry.shortCode === "OGN-007" && entry.sourceSlot === "chosenChampion",
    );
    expect(championEntry?.quantity).toBe(1);
    expect(championEntry?.explicitZone).toBe("champion");
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

describe("parseDeckImportData — tts format", () => {
  it("strips the art-variant suffix from short codes", () => {
    const input = "OGN-269-1 OGN-240-1 OGN-240-1 OGN-240-1";
    const { entries } = parseDeckImportData(input, "tts");

    const ogn269 = entries.find((entry) => entry.shortCode === "OGN-269");
    const ogn240 = entries.find(
      (entry) => entry.shortCode === "OGN-240" && entry.sourceSlot === "mainDeck",
    );
    expect(ogn269?.quantity).toBe(1);
    expect(ogn240?.quantity).toBe(2);
  });

  it("handles codes without a variant suffix", () => {
    const input = "OGN-001 OGN-002 OGN-002";
    const { entries } = parseDeckImportData(input, "tts");

    expect(entries.find((entry) => entry.shortCode === "OGN-001")?.quantity).toBe(1);
    expect(
      entries.find((entry) => entry.shortCode === "OGN-002" && entry.sourceSlot === "mainDeck"),
    ).toBeDefined();
  });

  it("assigns position 1 as chosenChampion", () => {
    const input = "OGN-001-1 OGN-002-1 OGN-003-1";
    const { entries } = parseDeckImportData(input, "tts");

    const champion = entries.find((entry) => entry.sourceSlot === "chosenChampion");
    expect(champion?.shortCode).toBe("OGN-002");
    expect(champion?.quantity).toBe(1);
    expect(champion?.explicitZone).toBe("champion");
  });

  it("assigns positions 56+ as sideboard", () => {
    const mainTokens = Array.from(
      { length: 56 },
      (_, index) => `TST-${String(index).padStart(3, "0")}-1`,
    );
    const sideboardTokens = ["SB-001-1", "SB-002-1"];
    const input = [...mainTokens, ...sideboardTokens].join(" ");

    const { entries } = parseDeckImportData(input, "tts");

    const sideboardEntries = entries.filter((entry) => entry.sourceSlot === "sideboard");
    expect(sideboardEntries).toHaveLength(2);
    expect(sideboardEntries.find((entry) => entry.shortCode === "SB-001")).toBeDefined();
    expect(sideboardEntries.find((entry) => entry.shortCode === "SB-002")).toBeDefined();
  });
});

describe("parseDeckImportData — text format", () => {
  it("does not set explicitZone when no zone headers are present", () => {
    const input = "3 Iron Ballista\n2 Fury Rune";
    const { entries } = parseDeckImportData(input, "text");

    expect(entries).toHaveLength(2);
    expect(entries[0].explicitZone).toBeUndefined();
    expect(entries[1].explicitZone).toBeUndefined();
    expect(entries[0].sourceSlot).toBe("mainDeck");
    expect(entries[1].sourceSlot).toBe("mainDeck");
  });

  it("sets explicitZone when zone headers are present", () => {
    const input = "Legend:\n1 Kai'Sa\n\nRunes:\n5 Fury Rune";
    const { entries } = parseDeckImportData(input, "text");

    expect(entries).toHaveLength(2);
    expect(entries[0].explicitZone).toBe("legend");
    expect(entries[1].explicitZone).toBe("runes");
  });

  it("sets explicitZone only after a zone header is seen", () => {
    const input = "3 Iron Ballista\n\nSideboard:\n2 Cleave";
    const { entries } = parseDeckImportData(input, "text");

    expect(entries).toHaveLength(2);
    expect(entries[0].explicitZone).toBeUndefined();
    expect(entries[0].sourceSlot).toBe("mainDeck");
    expect(entries[1].explicitZone).toBe("sideboard");
    expect(entries[1].sourceSlot).toBe("sideboard");
  });

  it("uses correct sourceSlot for explicit zones", () => {
    const input = "Champion:\n1 Ekko";
    const { entries } = parseDeckImportData(input, "text");

    expect(entries[0].sourceSlot).toBe("chosenChampion");
    expect(entries[0].explicitZone).toBe("champion");
  });
});
