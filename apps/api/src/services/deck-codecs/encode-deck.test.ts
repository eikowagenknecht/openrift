import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import { describe, expect, it, vi } from "vitest";

import type { EncodeDeckRow } from "./encode-deck.js";
import { encodeDeck } from "./encode-deck.js";

// A fake short-code resolver: maps each row to `CODE-<index>`, or null for rows
// whose cardId is listed in `missing`.
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
    // Champion is encoded into mainDeck (+1) and marked as the chosen champion.
    expect(decoded.chosenChampion).toBe("OGN-002");
    const mainCounts = new Map(decoded.mainDeck.map((card) => [card.cardCode, card.count]));
    expect(mainCounts.get("OGN-001")).toBe(1); // legend
    expect(mainCounts.get("OGN-002")).toBe(1); // champion marker
    expect(mainCounts.get("OGN-003")).toBe(3); // unit A x3
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
    // unit A (OGN-003) x3 plus legend + champion.
    expect(result.code.split(" ").filter((code) => code === "OGN-003-1")).toHaveLength(3);
    expect(result.code).toContain("OGN-001-1");
  });

  it("warns and skips cards with no resolvable short code", async () => {
    const result = await encodeDeck(fakeResolver(new Set(["unitA"])), sampleRows, "tts");
    expect(result.warnings).toEqual([`Skipped "Unit A": no canonical printing found`]);
    expect(result.code).not.toContain("OGN-003");
  });
});
