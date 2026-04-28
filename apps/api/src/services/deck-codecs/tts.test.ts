import { describe, expect, it } from "vitest";

import { encodeTTS } from "./tts.js";
import type { DeckCodecCard } from "./types.js";

describe("encodeTTS", () => {
  it("appends -1 variant suffix to short codes", () => {
    const cards: DeckCodecCard[] = [
      {
        cardId: "1",
        shortCode: "OGN-269",
        zone: "main",
        quantity: 2,
        cardType: "unit",
        superTypes: [],
        domains: [],
      },
    ];

    const { code } = encodeTTS(cards);
    expect(code).toBe("OGN-269-1 OGN-269-1");
  });

  it("skips overflow cards", () => {
    const cards: DeckCodecCard[] = [
      {
        cardId: "1",
        shortCode: "OGN-001",
        zone: "overflow",
        quantity: 3,
        cardType: "unit",
        superTypes: [],
        domains: [],
      },
    ];

    const { code } = encodeTTS(cards);
    expect(code).toBe("");
  });

  it("outputs zones in TTS order: legend, champion, main, battlefield, runes, sideboard", () => {
    const cards: DeckCodecCard[] = [
      {
        cardId: "3",
        shortCode: "OGN-300",
        zone: "sideboard",
        quantity: 1,
        cardType: "unit",
        superTypes: [],
        domains: [],
      },
      {
        cardId: "1",
        shortCode: "OGN-100",
        zone: "legend",
        quantity: 1,
        cardType: "Legend",
        superTypes: [],
        domains: [],
      },
      {
        cardId: "2",
        shortCode: "OGN-200",
        zone: "main",
        quantity: 1,
        cardType: "unit",
        superTypes: [],
        domains: [],
      },
      {
        cardId: "4",
        shortCode: "OGN-400",
        zone: "runes",
        quantity: 1,
        cardType: "Rune",
        superTypes: [],
        domains: [],
      },
      {
        cardId: "5",
        shortCode: "OGN-500",
        zone: "champion",
        quantity: 1,
        cardType: "unit",
        superTypes: ["Champion"],
        domains: [],
      },
    ];

    const { code } = encodeTTS(cards);
    expect(code).toBe("OGN-100-1 OGN-500-1 OGN-200-1 OGN-400-1 OGN-300-1");
  });
});
