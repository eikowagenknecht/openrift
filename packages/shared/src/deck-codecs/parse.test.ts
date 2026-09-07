import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseDeckImportData } from "./parse.js";
import type { DeckCodeFormat } from "./types.js";

vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getDeckFromCode: vi.fn(),
}));

const mockGetDeckFromCode = vi.mocked(getDeckFromCode);

const FORMATS: readonly DeckCodeFormat[] = ["piltover", "text", "tts"];

describe("parseDeckImportData", () => {
  beforeEach(() => {
    mockGetDeckFromCode.mockReset();
  });

  it("warns instead of parsing when the input is empty in any format", () => {
    for (const format of FORMATS) {
      expect(parseDeckImportData("", format)).toEqual({
        entries: [],
        warnings: ["No data provided."],
      });
    }
  });

  it("treats whitespace-only input as empty", () => {
    expect(parseDeckImportData("  \n\t ", "text")).toEqual({
      entries: [],
      warnings: ["No data provided."],
    });
    expect(mockGetDeckFromCode).not.toHaveBeenCalled();
  });

  it("routes the text format to the zone-header parser", () => {
    const { entries } = parseDeckImportData("Legend:\n1 Garen\n\nSideboard:\n2 Fireball", "text");

    expect(entries.map((entry) => [entry.cardName, entry.quantity, entry.explicitZone])).toEqual([
      ["Garen", 1, "legend"],
      ["Fireball", 2, "sideboard"],
    ]);
  });

  it("routes the TTS format to the whitespace-token parser", () => {
    const { entries } = parseDeckImportData("OGN-001-1 OGN-001-1 OGN-002-1", "tts");

    expect(entries.map((entry) => [entry.shortCode, entry.quantity])).toEqual([
      ["OGN-001", 2],
      ["OGN-002", 1],
    ]);
  });

  it("routes the piltover format to the deck-code decoder", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [{ cardCode: "OGN-001", count: 3 }],
      sideboard: [],
      chosenChampion: "",
    } as unknown as ReturnType<typeof getDeckFromCode>);

    const { entries } = parseDeckImportData("SOMEDECKCODE", "piltover");

    expect(mockGetDeckFromCode).toHaveBeenCalledWith("SOMEDECKCODE");
    expect(entries.map((entry) => [entry.shortCode, entry.quantity])).toEqual([["OGN-001", 3]]);
  });

  it("reports an undecodable piltover code as a warning with no entries", () => {
    mockGetDeckFromCode.mockImplementation(() => {
      throw new Error("bad code");
    });

    expect(parseDeckImportData("NOTACODE", "piltover")).toEqual({
      entries: [],
      warnings: ["Invalid Piltover Archive deck code."],
    });
  });

  it("trims the input before handing it to the format parser", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [],
      sideboard: [],
      chosenChampion: "",
    } as unknown as ReturnType<typeof getDeckFromCode>);

    parseDeckImportData("\n  SOMEDECKCODE \n", "piltover");

    expect(mockGetDeckFromCode).toHaveBeenCalledWith("SOMEDECKCODE");
  });
});
