import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import { describe, expect, it, vi } from "vitest";

import type { EncodeDeckRow } from "./encode-deck.js";
import { encodeDeck } from "./encode-deck.js";

function fakeResolver(missing = new Set<string>()) {
  return {
    shortCodesForRows: vi.fn(
      async (rows: { cardId: string; preferredPrintingId: string | null }[]) =>
        rows.map((entry, index) => ({
          cardId: entry.cardId,
          preferredPrintingId: entry.preferredPrintingId,
          shortCode: missing.has(entry.cardId) ? null : `OGN-00${index + 1}`,
        })),
    ),
  };
}

function row(
  partial: Partial<EncodeDeckRow> & Pick<EncodeDeckRow, "cardId" | "zone">,
): EncodeDeckRow {
  return {
    quantity: 1,
    preferredPrintingId: null,
    cardName: partial.cardId,
    cardType: "unit",
    superTypes: [],
    domains: [],
    ...partial,
  };
}

const sampleRows: EncodeDeckRow[] = [
  row({ cardId: "legend", zone: "legend", cardName: "The Legend" }),
  row({ cardId: "champ", zone: "champion", cardName: "A Champion" }),
  row({ cardId: "unitA", zone: "main", quantity: 3, cardName: "Unit A" }),
];

describe("encodeDeck", () => {
  it("resolves short codes once and produces a Piltover code that round-trips", async () => {
    const resolver = fakeResolver();
    const result = await encodeDeck(resolver, sampleRows, "piltover");

    expect(resolver.shortCodesForRows).toHaveBeenCalledOnce();
    expect(result.warnings).toEqual([]);
    expect(result.code).toBeTruthy();

    const decoded = getDeckFromCode(result.code);
    expect(decoded.chosenChampion).toBe("OGN-002");
    const mainCounts = new Map(decoded.mainDeck.map((card) => [card.cardCode, card.count]));
    expect(mainCounts.get("OGN-001")).toBe(1);
    expect(mainCounts.get("OGN-002")).toBe(1);
    expect(mainCounts.get("OGN-003")).toBe(3);
  });

  it("emits a human-readable text export grouped by zone", async () => {
    const result = await encodeDeck(fakeResolver(), sampleRows, "text");
    expect(result.code).toContain("Legend:");
    expect(result.code).toContain("1 The Legend");
    expect(result.code).toContain("MainDeck:");
    expect(result.code).toContain("3 Unit A");
    expect(result.warnings).toEqual([]);
  });

  it("emits repeated short codes for TTS", async () => {
    const result = await encodeDeck(fakeResolver(), sampleRows, "tts");
    expect(result.code.split(" ").filter((code) => code === "OGN-003-1")).toHaveLength(3);
    expect(result.code).toContain("OGN-001-1");
  });

  it("warns and skips cards with no resolvable short code", async () => {
    const result = await encodeDeck(fakeResolver(new Set(["unitA"])), sampleRows, "tts");
    expect(result.warnings).toEqual([`Skipped "Unit A": no canonical printing found`]);
    expect(result.code).not.toContain("OGN-003");
  });
});

function mappedResolver(
  codes: Record<string, { pinned?: string | null; fallback: string | null }>,
) {
  return {
    shortCodesForRows: vi.fn(
      async (rows: { cardId: string; preferredPrintingId: string | null }[]) =>
        rows.map((entry) => ({
          cardId: entry.cardId,
          preferredPrintingId: entry.preferredPrintingId,
          shortCode:
            entry.preferredPrintingId === null
              ? (codes[entry.cardId]?.fallback ?? null)
              : (codes[entry.cardId]?.pinned ?? null),
        })),
    ),
  };
}

describe("encodeDeck piltover degradation", () => {
  // The installed Piltover library only knows OGN/OGS/ARC/SFD/UNL/VEN; other sets throw.
  it("falls back to the default printing when a pinned printing can't be encoded", async () => {
    const rows = [
      row({ cardId: "legend", zone: "legend", cardName: "The Legend" }),
      row({
        cardId: "unitA",
        zone: "main",
        quantity: 2,
        cardName: "Unit A",
        preferredPrintingId: "printing-founders",
      }),
    ];
    const resolver = mappedResolver({
      legend: { fallback: "OGN-001" },
      unitA: { pinned: "FND-196", fallback: "OGN-045" },
    });

    const result = await encodeDeck(resolver, rows, "piltover");

    expect(result.warnings).toEqual([
      `"Unit A": deck codes don't support the pinned printing FND-196 yet, used OGN-045 instead`,
    ]);
    const decoded = getDeckFromCode(result.code);
    const mainCounts = new Map(decoded.mainDeck.map((card) => [card.cardCode, card.count]));
    expect(mainCounts.get("OGN-045")).toBe(2);
  });

  it("skips a card whose only printing can't be encoded, keeping the rest", async () => {
    const rows = [
      row({ cardId: "legend", zone: "legend", cardName: "The Legend" }),
      row({ cardId: "founders", zone: "main", cardName: "Founders Card" }),
    ];
    const resolver = mappedResolver({
      legend: { fallback: "OGN-001" },
      founders: { fallback: "FND-001" },
    });

    const result = await encodeDeck(resolver, rows, "piltover");

    expect(result.warnings).toEqual([
      `Skipped "Founders Card": deck codes don't support FND-001 yet`,
    ]);
    const decoded = getDeckFromCode(result.code);
    expect(decoded.mainDeck.map((card) => card.cardCode)).toEqual(["OGN-001"]);
  });

  it("skips a pinned card when the default printing can't be encoded either", async () => {
    const rows = [
      row({ cardId: "legend", zone: "legend", cardName: "The Legend" }),
      row({
        cardId: "token",
        zone: "main",
        cardName: "Token Card",
        preferredPrintingId: "printing-token",
      }),
    ];
    const resolver = mappedResolver({
      legend: { fallback: "OGN-001" },
      token: { pinned: "SFD-T01", fallback: "SFD-T01" },
    });

    const result = await encodeDeck(resolver, rows, "piltover");

    expect(result.warnings).toEqual([`Skipped "Token Card": deck codes don't support SFD-T01 yet`]);
    const decoded = getDeckFromCode(result.code);
    expect(decoded.mainDeck.map((card) => card.cardCode)).toEqual(["OGN-001"]);
  });
});
