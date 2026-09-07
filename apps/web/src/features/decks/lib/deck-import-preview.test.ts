import type { DeckZone } from "@openrift/shared/types/enums";
import { describe, expect, it } from "vitest";

import type { DeckMatchStatus, DeckMatchedEntry } from "@/features/decks/lib/deck-import-matcher";

import { deckImportRowId, sortDeckImportEntries } from "./deck-import-preview";

const ZONE_ORDER = ["legend", "mainDeck", "runes"] as DeckZone[];

function entry(
  options: {
    zone?: DeckZone;
    status?: DeckMatchStatus;
    cardName?: string;
    shortCode?: string;
    resolvedName?: string;
  } = {},
): DeckMatchedEntry {
  const resolvedName = options.resolvedName;
  return {
    entry: {
      cardName: options.cardName,
      shortCode: options.shortCode,
      quantity: 1,
      sourceSlot: "mainDeck",
      rawFields: {},
    },
    status: options.status ?? "exact",
    resolvedCard: resolvedName
      ? {
          cardId: resolvedName,
          cardName: resolvedName,
          cardType: "unit",
          cardTypes: ["unit"],
          superTypes: [],
          domains: [],
          shortCode: options.shortCode ?? "OGN-001",
          preferredPrintingId: null,
        }
      : null,
    candidates: [],
    zone: options.zone ?? ("mainDeck" as DeckZone),
  } as DeckMatchedEntry;
}

describe("deckImportRowId", () => {
  it("builds a valid selector-safe id per index", () => {
    expect(deckImportRowId(0)).toBe("deck-import-entry-0");
    expect(deckImportRowId(12)).toBe("deck-import-entry-12");
  });
});

describe("sortDeckImportEntries", () => {
  it("orders by the given zone order first", () => {
    const sorted = sortDeckImportEntries(
      [
        entry({ zone: "runes" as DeckZone, cardName: "A" }),
        entry({ zone: "legend" as DeckZone, cardName: "B" }),
        entry({ zone: "mainDeck" as DeckZone, cardName: "C" }),
      ],
      ZONE_ORDER,
    );
    expect(sorted.map((item) => item.zone)).toEqual(["legend", "mainDeck", "runes"]);
  });

  it("sorts zones missing from the order last", () => {
    const sorted = sortDeckImportEntries(
      [
        entry({ zone: "battlefield" as DeckZone, cardName: "A" }),
        entry({ zone: "legend" as DeckZone, cardName: "B" }),
      ],
      ZONE_ORDER,
    );
    expect(sorted.map((item) => item.zone)).toEqual(["legend", "battlefield"]);
  });

  it("sorts by display name within a zone, case-insensitively", () => {
    const sorted = sortDeckImportEntries(
      [entry({ cardName: "zed" }), entry({ cardName: "Ahri" }), entry({ cardName: "Malphite" })],
      ZONE_ORDER,
    );
    expect(sorted.map((item) => item.entry.cardName)).toEqual(["Ahri", "Malphite", "zed"]);
  });

  it("prefers the resolved card name over the parsed name", () => {
    const sorted = sortDeckImportEntries(
      [
        entry({ cardName: "Aaa", resolvedName: "Zed" }),
        entry({ cardName: "Zzz", resolvedName: "Ahri" }),
      ],
      ZONE_ORDER,
    );
    expect(sorted.map((item) => item.resolvedCard?.cardName)).toEqual(["Ahri", "Zed"]);
  });

  it("falls back to the short code when no name is present", () => {
    const sorted = sortDeckImportEntries(
      [entry({ shortCode: "OGN-002" }), entry({ shortCode: "OGN-001" })],
      ZONE_ORDER,
    );
    expect(sorted.map((item) => item.entry.shortCode)).toEqual(["OGN-001", "OGN-002"]);
  });

  it("breaks name ties by status, unresolved first", () => {
    const sorted = sortDeckImportEntries(
      [
        entry({ cardName: "Ahri", status: "exact" }),
        entry({ cardName: "Ahri", status: "unresolved" }),
        entry({ cardName: "Ahri", status: "needs-review" }),
      ],
      ZONE_ORDER,
    );
    expect(sorted.map((item) => item.status)).toEqual(["unresolved", "needs-review", "exact"]);
  });

  it("leaves the input array untouched", () => {
    const entries = [entry({ cardName: "Zed" }), entry({ cardName: "Ahri" })];
    sortDeckImportEntries(entries, ZONE_ORDER);
    expect(entries.map((item) => item.entry.cardName)).toEqual(["Zed", "Ahri"]);
  });
});
