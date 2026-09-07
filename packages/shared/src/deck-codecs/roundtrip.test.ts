import { describe, expect, it } from "vitest";

import type { DeckZone } from "../types/enums.js";
import { WellKnown } from "../well-known.js";
import { inferZone } from "../zone-inference.js";
import { parseDeckImportData } from "./parse.js";
import { piltoverCodec } from "./piltover.js";
import { encodeText } from "./text.js";
import { encodeTTS } from "./tts.js";
import type { DeckCodecCard, DeckCodeFormat } from "./types.js";

let nextCardId = 0;

function card(overrides: Partial<DeckCodecCard> & { shortCode: string }): DeckCodecCard {
  nextCardId++;
  return {
    cardId: `uuid-${nextCardId}`,
    cardName: `Card ${overrides.shortCode}`,
    zone: WellKnown.deckZone.MAIN,
    quantity: 1,
    cardType: "unit",
    superTypes: [],
    domains: [],
    preferredPrintingId: null,
    ...overrides,
  };
}

function shortCode(index: number): string {
  return `OGN-${String(index).padStart(3, "0")}`;
}

function completeDeck(
  options: { mainCount?: number; battlefields?: number; sideboard?: number } = {},
): DeckCodecCard[] {
  const { mainCount = 39, battlefields = 3, sideboard = 0 } = options;
  const cards: DeckCodecCard[] = [];
  let code = 0;
  const push = (zone: DeckZone, cardType: string, count: number): void => {
    for (let index = 0; index < count; index++) {
      code++;
      cards.push(card({ shortCode: shortCode(code), zone, cardType: cardType as never }));
    }
  };
  push(WellKnown.deckZone.LEGEND, WellKnown.cardType.LEGEND, 1);
  push(WellKnown.deckZone.CHAMPION, "unit", 1);
  push(WellKnown.deckZone.MAIN, "unit", mainCount);
  push(WellKnown.deckZone.BATTLEFIELD, WellKnown.cardType.BATTLEFIELD, battlefields);
  push(WellKnown.deckZone.RUNES, WellKnown.cardType.RUNE, 12);
  push(WellKnown.deckZone.SIDEBOARD, "unit", sideboard);
  return cards;
}

/**
 * Runs entries through the same zone resolution the import page applies: an
 * explicit zone wins, otherwise the card's type and source slot decide.
 */
function resolveZones(
  cards: DeckCodecCard[],
  format: DeckCodeFormat,
  code: string,
): Map<string, { zone: DeckZone; quantity: number }> {
  const { entries } = parseDeckImportData(code, format);
  const byShortCode = new Map(cards.map((entry) => [entry.shortCode, entry]));
  const byName = new Map(cards.map((entry) => [entry.cardName, entry]));

  const resolved = new Map<string, { zone: DeckZone; quantity: number }>();
  for (const entry of entries) {
    const source = entry.shortCode
      ? byShortCode.get(entry.shortCode)
      : byName.get(entry.cardName ?? "");
    expect(source, `no catalog card for ${entry.shortCode ?? entry.cardName}`).toBeDefined();
    const zone =
      entry.explicitZone ?? inferZone([source!.cardType], source!.superTypes, entry.sourceSlot);
    const key = source!.shortCode;
    const existing = resolved.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      resolved.set(key, { zone, quantity: entry.quantity });
    }
  }
  return resolved;
}

function expectedZones(cards: DeckCodecCard[]): Map<string, { zone: DeckZone; quantity: number }> {
  return new Map(
    cards.map((entry) => [entry.shortCode, { zone: entry.zone, quantity: entry.quantity }]),
  );
}

describe("text format round trip", () => {
  it("restores every zone and quantity for a complete deck", () => {
    const cards = completeDeck({ sideboard: 4 });
    const { code } = encodeText(cards);

    expect(resolveZones(cards, "text", code)).toEqual(expectedZones(cards));
  });

  it("restores a Custom-Region deck (one battlefield, no sideboard)", () => {
    const cards = completeDeck({ battlefields: 1 });
    const { code } = encodeText(cards);

    expect(resolveZones(cards, "text", code)).toEqual(expectedZones(cards));
  });

  it("restores a half-built deck", () => {
    const cards = completeDeck({ mainCount: 5, battlefields: 1 });
    const { code } = encodeText(cards);

    expect(resolveZones(cards, "text", code)).toEqual(expectedZones(cards));
  });

  it("pins the zone headers the reader matches on", () => {
    const { code } = encodeText(completeDeck({ mainCount: 1, sideboard: 1 }));

    // Renaming any of these without updating the reader breaks the round trip.
    expect(code).toContain("Legend:");
    expect(code).toContain("Champion:");
    expect(code).toContain("MainDeck:");
    expect(code).toContain("Battlefields:");
    expect(code).toContain("Runes:");
    expect(code).toContain("Sideboard:");
  });

  it("carries multi-copy quantities back", () => {
    const cards = [card({ shortCode: "OGN-500", cardName: "Fireball", zone: "main", quantity: 3 })];
    const { code } = encodeText(cards);

    expect(resolveZones(cards, "text", code)).toEqual(expectedZones(cards));
  });
});

describe("TTS format round trip", () => {
  it("restores every zone and quantity for a complete constructed deck", () => {
    const cards = completeDeck({ sideboard: 4 });
    const { code } = encodeTTS(cards);

    expect(resolveZones(cards, "tts", code)).toEqual(expectedZones(cards));
  });

  it("restores a complete constructed deck with no sideboard", () => {
    const cards = completeDeck();
    const { code } = encodeTTS(cards);

    expect(resolveZones(cards, "tts", code)).toEqual(expectedZones(cards));
  });

  it("restores a complete Custom-Region deck (54 tokens)", () => {
    const cards = completeDeck({ battlefields: 1 });
    const { code } = encodeTTS(cards);

    expect(code.split(" ")).toHaveLength(54);
    expect(resolveZones(cards, "tts", code)).toEqual(expectedZones(cards));
  });

  it("does not claim a champion or sideboard for a half-built deck", () => {
    const cards = completeDeck({ mainCount: 5, battlefields: 1 });
    const { code } = encodeTTS(cards);
    const { entries, warnings } = parseDeckImportData(code, "tts");

    expect(entries.every((entry) => entry.sourceSlot === "mainDeck")).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("doesn't match a complete deck layout");
  });

  it("does not mis-tag the first main-deck card as champion when the deck has no champion", () => {
    const cards = completeDeck().filter((entry) => entry.zone !== WellKnown.deckZone.CHAMPION);
    const { code } = encodeTTS(cards);
    const resolved = resolveZones(cards, "tts", code);

    expect([...resolved.values()].some((entry) => entry.zone === WellKnown.deckZone.CHAMPION)).toBe(
      false,
    );
    expect(resolved).toEqual(expectedZones(cards));
  });

  it("does not slot by position when a dropped card leaves the stream short", () => {
    const cards = completeDeck();
    cards[10]!.shortCode = "";
    const { code, warnings } = encodeTTS(cards);

    expect(warnings).toHaveLength(1);
    const { entries } = parseDeckImportData(code, "tts");
    // 55 tokens matches no complete layout, so every index after the gap is unreliable.
    expect(entries.every((entry) => entry.sourceSlot === "mainDeck")).toBe(true);
  });

  it("still shifts by one when the dropped card sits in a deck that has a sideboard", () => {
    // 56 + sideboard - 1 is still a legal length, so length alone can't
    // detect the gap here; the encoder's per-card warning surfaces it instead.
    const cards = completeDeck({ sideboard: 4 });
    cards[10]!.shortCode = "";
    const { code, warnings } = encodeTTS(cards);

    expect(warnings).toHaveLength(1);
    const { entries } = parseDeckImportData(code, "tts");
    const sideboard = entries.filter((entry) => entry.sourceSlot === "sideboard");
    expect(sideboard).toHaveLength(3);
  });
});

describe("Piltover deck code round trip", () => {
  it("restores zones and quantities for a complete deck with a sideboard", () => {
    const cards = completeDeck({ sideboard: 3 });
    const { code, warnings } = piltoverCodec.encode(cards);

    expect(warnings).toEqual([]);
    expect(resolveZones(cards, "piltover", code)).toEqual(expectedZones(cards));
  });

  it("does not double-count a champion that also has main-deck copies", () => {
    const cards = [
      card({ shortCode: "OGN-007", cardName: "Garen", zone: "champion" }),
      card({ shortCode: "OGN-007", cardName: "Garen", zone: "main", quantity: 2 }),
      card({ shortCode: "OGN-001", cardName: "Fireball", zone: "main", quantity: 3 }),
    ];
    const { code } = piltoverCodec.encode(cards);
    const { entries } = parseDeckImportData(code, "piltover");

    const total = entries
      .filter((entry) => entry.shortCode === "OGN-007")
      .reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total).toBe(3);
    expect(entries.find((entry) => entry.sourceSlot === "chosenChampion")?.shortCode).toBe(
      "OGN-007",
    );
  });

  it("reads back a code the user pasted lowercased", () => {
    const cards = completeDeck({ mainCount: 3, battlefields: 1 });
    const { code } = piltoverCodec.encode(cards);

    expect(parseDeckImportData(code.toLowerCase(), "piltover").entries).toEqual(
      parseDeckImportData(code, "piltover").entries,
    );
  });
});
