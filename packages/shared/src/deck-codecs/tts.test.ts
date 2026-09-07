import { describe, expect, it } from "vitest";

import { encodeTTS, parseTTSFormat } from "./tts.js";
import type { DeckCodecCard } from "./types.js";

function card(overrides: Partial<DeckCodecCard>): DeckCodecCard {
  return {
    cardId: "1",
    shortCode: "OGN-001",
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

function tokens(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `OGN-${String(index + 1).padStart(3, "0")}-1`,
  ).join(" ");
}

describe("encodeTTS", () => {
  it("appends -1 variant suffix to short codes", () => {
    const { code } = encodeTTS([card({ shortCode: "OGN-269", quantity: 2 })]);
    expect(code).toBe("OGN-269-1 OGN-269-1");
  });

  it("skips overflow cards", () => {
    const { code } = encodeTTS([card({ zone: "overflow", quantity: 3 })]);
    expect(code).toBe("");
  });

  it("outputs zones in TTS order: legend, champion, main, battlefield, runes, sideboard", () => {
    const cards: DeckCodecCard[] = [
      card({ cardId: "3", shortCode: "OGN-300", zone: "sideboard" }),
      card({ cardId: "1", shortCode: "OGN-100", zone: "legend", cardType: "legend" }),
      card({ cardId: "2", shortCode: "OGN-200", zone: "main" }),
      card({ cardId: "4", shortCode: "OGN-400", zone: "runes", cardType: "rune" }),
      card({ cardId: "5", shortCode: "OGN-500", zone: "champion", superTypes: ["champion"] }),
    ];

    const { code } = encodeTTS(cards);
    expect(code).toBe("OGN-100-1 OGN-500-1 OGN-200-1 OGN-400-1 OGN-300-1");
  });

  it("warns by name and drops a card with no short code", () => {
    const { code, warnings } = encodeTTS([
      card({ cardId: "abc", shortCode: "" }),
      card({ shortCode: "OGN-200" }),
    ]);

    expect(code).toBe("OGN-200-1");
    expect(warnings).toEqual(["Skipped card abc: no canonical printing found"]);
  });
});

describe("parseTTSFormat", () => {
  it("strips the art-variant suffix", () => {
    const { entries } = parseTTSFormat("OGN-269-1 OGN-269-1");

    expect(entries).toEqual([
      {
        shortCode: "OGN-269",
        quantity: 2,
        sourceSlot: "mainDeck",
        explicitZone: undefined,
        rawFields: { "Source Code": "OGN-269", Slot: "Main Deck" },
      },
    ]);
  });

  it("leaves a code without a variant suffix alone", () => {
    const { entries } = parseTTSFormat("OGN-269");
    expect(entries[0].shortCode).toBe("OGN-269");
  });

  it("reads the champion and sideboard positions of a complete constructed deck", () => {
    const { entries, warnings } = parseTTSFormat(tokens(60));

    expect(warnings).toEqual([]);
    expect(entries[1].sourceSlot).toBe("chosenChampion");
    expect(entries[1].explicitZone).toBe("champion");
    expect(entries.filter((entry) => entry.sourceSlot === "sideboard")).toHaveLength(4);
  });

  it("reads a complete constructed deck with no sideboard", () => {
    const { entries, warnings } = parseTTSFormat(tokens(56));

    expect(warnings).toEqual([]);
    expect(entries[1].sourceSlot).toBe("chosenChampion");
    expect(entries.some((entry) => entry.sourceSlot === "sideboard")).toBe(false);
  });

  it("reads a complete Custom-Region deck at 54 tokens", () => {
    const { entries, warnings } = parseTTSFormat(tokens(54));

    expect(warnings).toEqual([]);
    expect(entries[1].sourceSlot).toBe("chosenChampion");
    expect(entries.some((entry) => entry.sourceSlot === "sideboard")).toBe(false);
  });

  it("does not treat 55 tokens as Custom-Region plus a sideboard card", () => {
    const { entries, warnings } = parseTTSFormat(tokens(55));

    expect(entries.every((entry) => entry.sourceSlot === "mainDeck")).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  it("claims nothing positional for an incomplete deck and says so", () => {
    const { entries, warnings } = parseTTSFormat("OGN-001-1 OGN-002-1 OGN-003-1");

    expect(entries.every((entry) => entry.sourceSlot === "mainDeck")).toBe(true);
    expect(entries.every((entry) => entry.explicitZone === undefined)).toBe(true);
    expect(warnings[0]).toContain("doesn't match a complete deck layout");
  });

  it("returns nothing and warns about nothing for empty input", () => {
    const { entries, warnings } = parseTTSFormat("   ");

    expect(entries).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("groups repeats within a slot but keeps the same code in two slots apart", () => {
    const main = Array.from({ length: 56 }, (_, index) =>
      index === 55 ? "OGN-900-1" : `OGN-${String(index + 1).padStart(3, "0")}-1`,
    );
    const { entries } = parseTTSFormat([...main, "OGN-900-1", "OGN-900-1"].join(" "));

    const nine = entries.filter((entry) => entry.shortCode === "OGN-900");
    expect(nine).toHaveLength(2);
    expect(nine.find((entry) => entry.sourceSlot === "mainDeck")?.quantity).toBe(1);
    expect(nine.find((entry) => entry.sourceSlot === "sideboard")?.quantity).toBe(2);
  });
});
