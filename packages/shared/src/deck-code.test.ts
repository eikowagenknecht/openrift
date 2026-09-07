import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import { describe, expect, it, vi } from "vitest";

import { isDeckCode, parsePiltoverDeckCode } from "./deck-code.js";

// vi.mock is hoisted above the imports by vitest.
vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getDeckFromCode: vi.fn(),
}));

const mockGetDeckFromCode = vi.mocked(getDeckFromCode);

const VALID_CODE = "CEBAGAYDAMBQGE";

function mockValidCode(validCode: string): void {
  mockGetDeckFromCode.mockImplementation((code: string) => {
    if (code === validCode) {
      return { mainDeck: [{ cardCode: "OGN-001", count: 3 }], sideboard: [] };
    }
    throw new Error("invalid code");
  });
}

describe("parsePiltoverDeckCode", () => {
  it("does not double-count the chosen champion", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [
        { cardCode: "OGN-007", count: 3 },
        { cardCode: "OGN-001", count: 3 },
      ],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const { entries } = parsePiltoverDeckCode("FAKECODE");

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

    const { entries } = parsePiltoverDeckCode("FAKECODE");

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
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [
        { cardCode: "OGN-007", count: 2 },
        { cardCode: "OGN-007", count: 1 },
      ],
      sideboard: [],
      chosenChampion: "OGN-007",
    });

    const { entries } = parsePiltoverDeckCode("FAKECODE");

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

    const { entries } = parsePiltoverDeckCode("FAKECODE");

    expect(entries).toHaveLength(2);
    expect(entries[0]?.quantity).toBe(3);
    expect(entries[0]?.sourceSlot).toBe("mainDeck");
    expect(entries[1]?.quantity).toBe(1);
    expect(entries[1]?.sourceSlot).toBe("sideboard");
  });

  it("retries a failing code uppercased", () => {
    mockValidCode("FAKECODE");
    const { entries, warnings } = parsePiltoverDeckCode("fakecode");

    expect(warnings).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].shortCode).toBe("OGN-001");
  });

  it("still reports an invalid code after both attempts fail", () => {
    mockValidCode("FAKECODE");
    const { entries, warnings } = parsePiltoverDeckCode("nonsense");

    expect(entries).toHaveLength(0);
    expect(warnings).toEqual(["Invalid Piltover Archive deck code."]);
  });
});

describe("isDeckCode", () => {
  it("accepts a decodable base32 token", () => {
    mockValidCode(VALID_CODE);
    expect(isDeckCode(VALID_CODE)).toBe(true);
  });

  it("accepts a lowercased code via the uppercase retry", () => {
    mockValidCode(VALID_CODE);
    expect(isDeckCode(VALID_CODE.toLowerCase())).toBe(true);
  });

  it("rejects a base32-shaped token the decoder refuses", () => {
    mockValidCode(VALID_CODE);
    expect(isDeckCode("Battlecruiser")).toBe(false);
  });

  it("never calls the decoder for short tokens", () => {
    mockValidCode(VALID_CODE);
    expect(isDeckCode("Yasuo")).toBe(false);
    expect(mockGetDeckFromCode).not.toHaveBeenCalledWith("Yasuo");
  });
});
