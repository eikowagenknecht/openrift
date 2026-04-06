import { describe, expect, it } from "vitest";

import { decodeTTS, encodeTTS } from "./tts.js";
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

describe("decodeTTS", () => {
  it("strips the -1 variant suffix from short codes", () => {
    const { cards } = decodeTTS("OGN-269-1 OGN-240-1 OGN-240-1 OGN-240-1");

    // OGN-269 at pos 0 (mainDeck), OGN-240 at pos 1 (chosenChampion), OGN-240 at pos 2-3 (mainDeck)
    expect(cards).toHaveLength(3);
    expect(cards.find((c) => c.cardCode === "OGN-269")?.count).toBe(1);
    expect(
      cards.find((c) => c.cardCode === "OGN-240" && c.sourceSlot === "chosenChampion")?.count,
    ).toBe(1);
    expect(cards.find((c) => c.cardCode === "OGN-240" && c.sourceSlot === "mainDeck")?.count).toBe(
      2,
    );
  });

  it("handles codes without a variant suffix", () => {
    const { cards } = decodeTTS("OGN-001 OGN-002 OGN-002");

    // OGN-001 at pos 0, OGN-002 at pos 1 (champion), OGN-002 at pos 2 (main)
    expect(cards).toHaveLength(3);
    expect(cards.find((c) => c.cardCode === "OGN-001")?.count).toBe(1);
    expect(
      cards.find((c) => c.cardCode === "OGN-002" && c.sourceSlot === "chosenChampion")?.count,
    ).toBe(1);
    expect(cards.find((c) => c.cardCode === "OGN-002" && c.sourceSlot === "mainDeck")?.count).toBe(
      1,
    );
  });

  it("merges codes with same slot", () => {
    // Both at positions 0 and 1 → different slots, so 2 entries
    const { cards } = decodeTTS("OGN-001-1 OGN-001");

    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.cardCode === "OGN-001" && c.sourceSlot === "mainDeck")?.count).toBe(
      1,
    );
    expect(
      cards.find((c) => c.cardCode === "OGN-001" && c.sourceSlot === "chosenChampion")?.count,
    ).toBe(1);
  });

  it("assigns position 1 as chosenChampion", () => {
    const { cards } = decodeTTS("OGN-001-1 OGN-002-1 OGN-003-1");

    const champion = cards.find((c) => c.sourceSlot === "chosenChampion");
    expect(champion?.cardCode).toBe("OGN-002");
    expect(champion?.count).toBe(1);
  });

  it("assigns positions 56+ as sideboard", () => {
    // Build a string with 58 tokens: 56 main + 2 sideboard
    const mainTokens = Array.from(
      { length: 56 },
      (_, index) => `TST-${String(index).padStart(3, "0")}-1`,
    );
    const sideboardTokens = ["SB-001-1", "SB-002-1"];
    const input = [...mainTokens, ...sideboardTokens].join(" ");

    const { cards } = decodeTTS(input);

    const sideboardCards = cards.filter((c) => c.sourceSlot === "sideboard");
    expect(sideboardCards).toHaveLength(2);
    expect(sideboardCards.find((c) => c.cardCode === "SB-001")).toBeDefined();
    expect(sideboardCards.find((c) => c.cardCode === "SB-002")).toBeDefined();
  });

  it("groups same card across different slots separately", () => {
    // Card appears in both main deck (position 2) and sideboard (position 56+)
    const tokens = Array.from({ length: 56 }, () => "OGN-100-1");
    tokens.push("OGN-100-1"); // position 56 = sideboard

    const { cards } = decodeTTS(tokens.join(" "));

    const mainEntry = cards.find((c) => c.cardCode === "OGN-100" && c.sourceSlot === "mainDeck");
    const sbEntry = cards.find((c) => c.cardCode === "OGN-100" && c.sourceSlot === "sideboard");
    const champEntry = cards.find(
      (c) => c.cardCode === "OGN-100" && c.sourceSlot === "chosenChampion",
    );
    expect(mainEntry?.count).toBe(55); // positions 0, 2-55
    expect(champEntry?.count).toBe(1); // position 1
    expect(sbEntry?.count).toBe(1); // position 56
  });
});
