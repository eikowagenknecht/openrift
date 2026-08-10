import type { PublicDeckCardResponse } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import {
  entriesFromSharedDeck,
  extractDeckFromUrl,
  parseDeckImportAuto,
  parseDeckImportData,
  sniffDeckImportFormat,
} from "./deck-import-parsers";

// Mock the Piltover library — we control what getDeckFromCode returns so we can
// test our deduplication logic without depending on real binary deck codes.
vi.mock("@piltoverarchive/riftbound-deck-codes", () => ({
  getDeckFromCode: vi.fn(),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";

const mockGetDeckFromCode = vi.mocked(getDeckFromCode);

// Each format's parser lives next to its encoder in
// packages/shared/src/deck-codecs, tested there against real encoder output.
// What this file owns is the web-only chrome: format sniffing, URL extraction,
// and turning a resolved shared deck into import entries.
describe("parseDeckImportData", () => {
  it("delegates to the shared piltover parser", () => {
    mockGetDeckFromCode.mockReturnValue({
      mainDeck: [{ cardCode: "OGN-001", count: 3 }],
      sideboard: [],
      chosenChampion: undefined,
    });

    const { entries, warnings } = parseDeckImportData("FAKECODE", "piltover");

    expect(warnings).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      shortCode: "OGN-001",
      quantity: 3,
      sourceSlot: "mainDeck",
    });
  });

  it("surfaces the shared parser's invalid-code warning", () => {
    mockValidCode("FAKECODE");
    const { entries, warnings } = parseDeckImportData("nonsense", "piltover");

    expect(entries).toHaveLength(0);
    expect(warnings).toEqual(["Invalid Piltover Archive deck code."]);
  });
});

// ---------------------------------------------------------------------------
// Format sniffing
// ---------------------------------------------------------------------------

/** A base32-shaped string the mocked decoder accepts (14 chars, A–Z only). */
const VALID_CODE = "CEBAGAYDAMBQGE";

/** Makes the mocked decoder accept exactly one code and reject everything else. */
function mockValidCode(validCode: string): void {
  mockGetDeckFromCode.mockImplementation((code: string) => {
    if (code === validCode) {
      return { mainDeck: [{ cardCode: "OGN-001", count: 3 }], sideboard: [] };
    }
    throw new Error("invalid code");
  });
}

describe("sniffDeckImportFormat", () => {
  it("detects a lone decodable token as piltover", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat(VALID_CODE)).toBe("piltover");
  });

  it("detects a lowercased deck code via the uppercase retry", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat(VALID_CODE.toLowerCase())).toBe("piltover");
  });

  it("falls back to text for a lone word that does not decode", () => {
    mockValidCode(VALID_CODE);
    // 13 letters, passes the base32 charset pre-filter, but the decoder rejects it
    expect(sniffDeckImportFormat("Battlecruiser")).toBe("text");
  });

  it("never treats short words as deck codes", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("Yasuo")).toBe("text");
    // The charset pre-filter rejects short tokens without calling the decoder
    expect(mockGetDeckFromCode).not.toHaveBeenCalledWith("Yasuo");
  });

  it("detects space-separated short codes as tts", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("OGN-001-1 OGN-002-1 OGN-003-2")).toBe("tts");
  });

  it("detects short codes without variant suffixes as tts", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("OGN-001 OGN-002")).toBe("tts");
  });

  it("detects a single short code as tts", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("OGN-269-1")).toBe("tts");
  });

  it("detects quantity-name lines as text", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("3 Iron Ballista\n2 Brazen Buccaneer")).toBe("text");
  });

  it("detects zone-headered lists as text", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("Legend:\n1 Ekko\n\nMainDeck:\n3 Iron Ballista")).toBe("text");
  });

  it("falls back to text for empty input", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("")).toBe("text");
  });

  it("treats a mix of short codes and names as text", () => {
    mockValidCode(VALID_CODE);
    expect(sniffDeckImportFormat("OGN-001 Iron Ballista")).toBe("text");
  });
});

// The ?code= deep link on /decks/import goes through parseDeckImportAuto, so a
// URL-encoded text list works there exactly like a compact deck code.
describe("parseDeckImportAuto", () => {
  it("parses a zone-headered text list, as exported by external deck sites", () => {
    mockValidCode(VALID_CODE);
    const list = [
      "Legend:",
      "1 Diana, Scorn of the Moon",
      "",
      "Champion:",
      "1 Diana, Lunari",
      "",
      "MainDeck:",
      "3 Ravenbloom Student",
      "",
      "Battlefields:",
      "1 Targon's Peak",
      "",
      "Rune Pool:",
      "7 Chaos Rune",
      "",
      "Sideboard:",
      "2 Singularity",
    ].join("\n");

    const { format, entries, warnings } = parseDeckImportAuto(list);

    expect(format).toBe("text");
    expect(warnings).toHaveLength(0);
    expect(entries).toHaveLength(6);
    expect(entries.map((entry) => [entry.cardName, entry.quantity, entry.explicitZone])).toEqual([
      ["Diana, Scorn of the Moon", 1, "legend"],
      ["Diana, Lunari", 1, "champion"],
      ["Ravenbloom Student", 3, "main"],
      ["Targon's Peak", 1, "battlefield"],
      ["Chaos Rune", 7, "runes"],
      ["Singularity", 2, "sideboard"],
    ]);
  });

  it("parses a lone deck code as piltover", () => {
    mockValidCode(VALID_CODE);
    const { format, entries, warnings } = parseDeckImportAuto(VALID_CODE);

    expect(format).toBe("piltover");
    expect(warnings).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ shortCode: "OGN-001", quantity: 3 });
  });
});

describe("extractDeckFromUrl", () => {
  it("returns null for non-URL input", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl("3 Iron Ballista")).toBeNull();
    expect(extractDeckFromUrl(VALID_CODE)).toBeNull();
    expect(extractDeckFromUrl("OGN-001 OGN-002")).toBeNull();
  });

  it("returns null for multi-line input containing a URL", () => {
    mockValidCode(VALID_CODE);
    expect(
      extractDeckFromUrl("see this deck\nhttps://openrift.app/decks/share/Abc123Xyz456"),
    ).toBeNull();
  });

  it("extracts the share token from an OpenRift share link", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl("https://openrift.app/decks/share/Abc123Xyz456")).toEqual({
      kind: "share-token",
      token: "Abc123Xyz456",
    });
  });

  it("extracts the share token from a protocol-less link", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl("openrift.app/decks/share/Abc123Xyz456")).toEqual({
      kind: "share-token",
      token: "Abc123Xyz456",
    });
  });

  it("extracts the share token despite trailing slash and query params", () => {
    mockValidCode(VALID_CODE);
    expect(
      extractDeckFromUrl("https://openrift.app/decks/share/Abc123Xyz456/?utm_source=discord"),
    ).toEqual({ kind: "share-token", token: "Abc123Xyz456" });
  });

  it("matches share paths on any host", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl("https://preview.openrift.app/decks/share/Abc123Xyz456")).toEqual({
      kind: "share-token",
      token: "Abc123Xyz456",
    });
  });

  it("finds a deck code in a query parameter", () => {
    mockValidCode(VALID_CODE);
    expect(
      extractDeckFromUrl(`https://piltoverarchive.com/deck-builder?deck=${VALID_CODE}`),
    ).toEqual({ kind: "deck-code", code: VALID_CODE });
  });

  it("finds a deck code in a path segment", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl(`https://example.com/decks/${VALID_CODE}`)).toEqual({
      kind: "deck-code",
      code: VALID_CODE,
    });
  });

  it("finds a deck code in a hash fragment", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl(`https://example.com/builder#deck=${VALID_CODE}`)).toEqual({
      kind: "deck-code",
      code: VALID_CODE,
    });
  });

  it("supports www-prefixed links without a protocol", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl(`www.piltoverarchive.com/deck?code=${VALID_CODE}`)).toEqual({
      kind: "deck-code",
      code: VALID_CODE,
    });
  });

  it("reports a URL with no recognizable deck content", () => {
    mockValidCode(VALID_CODE);
    expect(extractDeckFromUrl("https://example.com/some/interesting/page")).toEqual({
      kind: "url-no-deck",
    });
  });

  it("does not decode plausible-looking path segments that fail decoding", () => {
    mockValidCode(VALID_CODE);
    // "deckbuilding" passes the charset filter but the decoder rejects it
    expect(extractDeckFromUrl("https://example.com/deckbuilding/page")).toEqual({
      kind: "url-no-deck",
    });
  });
});

// ---------------------------------------------------------------------------
// Shared-deck link import
// ---------------------------------------------------------------------------

/**
 * Builds a public deck card row with sensible defaults for entry conversion tests.
 * @returns A complete PublicDeckCardResponse with the overrides applied.
 */
function publicDeckCard(overrides: Partial<PublicDeckCardResponse>): PublicDeckCardResponse {
  return {
    cardId: "card-1",
    zone: "main",
    quantity: 3,
    preferredPrintingId: null,
    cardName: "Iron Ballista",
    cardSlug: "iron-ballista",
    cardType: "Unit",
    cardTypes: ["Unit"],
    superTypes: [],
    domains: [],
    tags: [],
    keywords: [],
    maxCopiesOverride: null,
    banned: false,
    energy: null,
    might: null,
    power: null,
    resolvedPrintingId: null,
    shortCode: "OGN-100",
    imageId: null,
    ...overrides,
  };
}

describe("entriesFromSharedDeck", () => {
  it("preserves zones and quantities", () => {
    const entries = entriesFromSharedDeck([
      publicDeckCard({ zone: "champion", quantity: 1, cardName: "Ekko", shortCode: "OGN-007" }),
      publicDeckCard({ zone: "main", quantity: 3 }),
      publicDeckCard({ zone: "sideboard", quantity: 2, cardName: "Fury Rune", shortCode: null }),
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      shortCode: "OGN-007",
      cardName: "Ekko",
      quantity: 1,
      explicitZone: "champion",
      sourceSlot: "chosenChampion",
    });
    expect(entries[1]).toMatchObject({
      quantity: 3,
      explicitZone: "main",
      sourceSlot: "mainDeck",
    });
    expect(entries[2]).toMatchObject({
      cardName: "Fury Rune",
      quantity: 2,
      explicitZone: "sideboard",
      sourceSlot: "sideboard",
    });
    // A null shortCode becomes undefined so the matcher falls back to the name
    expect(entries[2].shortCode).toBeUndefined();
  });

  it("carries display raw fields for the preview row", () => {
    const entries = entriesFromSharedDeck([publicDeckCard({ zone: "battlefield" })]);

    expect(entries[0].rawFields).toEqual({ "Parsed Name": "Iron Ballista", Zone: "Battlefields" });
  });
});
