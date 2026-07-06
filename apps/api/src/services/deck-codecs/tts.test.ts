import { describe, expect, it } from "vitest";

import { encodeTTS } from "./tts.js";
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
});
