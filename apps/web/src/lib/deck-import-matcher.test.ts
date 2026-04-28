import { describe, expect, it } from "vitest";

import type { DeckImportEntry } from "@/lib/deck-import-parsers";
import { stubPrinting } from "@/test/factories";

import { matchDeckEntries } from "./deck-import-matcher";

function textEntry(cardName: string, zone?: DeckImportEntry["explicitZone"]): DeckImportEntry {
  return {
    cardName,
    quantity: 1,
    sourceSlot: "mainDeck",
    explicitZone: zone,
    rawFields: {},
  };
}

describe("matchDeckEntries", () => {
  describe("tag + name matching", () => {
    const printings = [
      stubPrinting({
        shortCode: "OGN-001",
        card: { name: "The Boss", type: "Legend", tags: ["Sett"] },
      }),
      stubPrinting({
        shortCode: "OGN-002",
        card: { name: "Sett, Kingpin", type: "Legend", tags: ["Sett", "Ionia"] },
      }),
      stubPrinting({
        shortCode: "OGN-003",
        card: { name: "Pit Rookie", type: "Unit", tags: [] },
      }),
    ];

    it("resolves 'Sett, The Boss' via tag+name when exact name fails", () => {
      const entries = [textEntry("Sett, The Boss", "legend")];
      const results = matchDeckEntries(entries, printings);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("exact");
      expect(results[0].resolvedCard?.cardName).toBe("The Boss");
    });

    it("prefers exact name match over tag+name", () => {
      const entries = [textEntry("Sett, Kingpin", "legend")];
      const results = matchDeckEntries(entries, printings);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("exact");
      expect(results[0].resolvedCard?.cardName).toBe("Sett, Kingpin");
    });

    it("returns unresolved when tag does not match", () => {
      const entries = [textEntry("Draven, The Boss")];
      const results = matchDeckEntries(entries, printings);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("unresolved");
    });

    it("returns unresolved when name after comma does not match", () => {
      const entries = [textEntry("Sett, Nonexistent")];
      const results = matchDeckEntries(entries, printings);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("unresolved");
    });

    it("handles case-insensitive tag matching via normalization", () => {
      const entries = [textEntry("sett, the boss", "legend")];
      const results = matchDeckEntries(entries, printings);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("exact");
      expect(results[0].resolvedCard?.cardName).toBe("The Boss");
    });

    it("does not attempt tag+name split for names without commas", () => {
      const entries = [textEntry("Pit Rookie")];
      const results = matchDeckEntries(entries, printings);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("exact");
      expect(results[0].resolvedCard?.cardName).toBe("Pit Rookie");
    });
  });

  describe("shortCode lookup language independence", () => {
    // Multiple language printings share a shortCode. The deck-code formats
    // (Piltover, TTS) only encode card identity, so the matcher must not pin
    // a specific language printing — display falls back to language preference.
    const enPrinting = stubPrinting({
      id: "printing-en",
      shortCode: "OGN-001",
      language: "EN",
      card: { name: "Test Card", type: "Unit" },
    });
    const zhPrinting = stubPrinting({
      id: "printing-zh",
      shortCode: "OGN-001",
      language: "ZH",
      // Same cardId so they're treated as the same card.
      cardId: enPrinting.cardId,
      card: { ...enPrinting.card, name: "Test Card" },
    });

    it("does not pin a printingId for shortCode lookups (EN-first ordering)", () => {
      const entries: DeckImportEntry[] = [
        { shortCode: "OGN-001", quantity: 1, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, [enPrinting, zhPrinting]);
      expect(result[0].status).toBe("exact");
      expect(result[0].resolvedCard?.preferredPrintingId).toBeNull();
    });

    it("does not pin a printingId for shortCode lookups (ZH-first ordering)", () => {
      const entries: DeckImportEntry[] = [
        { shortCode: "OGN-001", quantity: 1, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, [zhPrinting, enPrinting]);
      expect(result[0].status).toBe("exact");
      expect(result[0].resolvedCard?.preferredPrintingId).toBeNull();
    });
  });

  describe("zone inference without headers", () => {
    const catalog = [
      stubPrinting({
        shortCode: "RB-001",
        card: { name: "Kai'Sa, Daughter of the Void", type: "Legend", tags: ["Kai'Sa"] },
      }),
      stubPrinting({ shortCode: "RB-002", card: { name: "Fury Rune", type: "Rune" } }),
      stubPrinting({ shortCode: "RB-003", card: { name: "Iron Ballista", type: "Unit" } }),
      stubPrinting({
        shortCode: "RB-004",
        card: { name: "Ekko, Recurrent", type: "Unit", superTypes: ["Champion"], tags: ["Ekko"] },
      }),
      stubPrinting({
        shortCode: "RB-005",
        card: {
          name: "Kai'Sa, Survivor",
          type: "Unit",
          superTypes: ["Champion"],
          tags: ["Kai'Sa"],
        },
      }),
      stubPrinting({ shortCode: "RB-006", card: { name: "Altar to Unity", type: "Battlefield" } }),
    ];

    it("assigns Legend cards to legend zone", () => {
      const entries: DeckImportEntry[] = [
        {
          cardName: "Kai'Sa, Daughter of the Void",
          quantity: 1,
          sourceSlot: "mainDeck",
          rawFields: {},
        },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("legend");
    });

    it("assigns Rune cards to runes zone", () => {
      const entries: DeckImportEntry[] = [
        { cardName: "Fury Rune", quantity: 5, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("runes");
    });

    it("assigns Battlefield cards to battlefield zone", () => {
      const entries: DeckImportEntry[] = [
        { cardName: "Altar to Unity", quantity: 1, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("battlefield");
    });

    it("assigns regular Unit cards to main zone", () => {
      const entries: DeckImportEntry[] = [
        { cardName: "Iron Ballista", quantity: 3, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("main");
    });
  });

  describe("champion auto-assignment", () => {
    const catalog = [
      stubPrinting({ shortCode: "RB-003", card: { name: "Iron Ballista", type: "Unit" } }),
      stubPrinting({
        shortCode: "RB-004",
        card: { name: "Ekko, Recurrent", type: "Unit", superTypes: ["Champion"], tags: ["Ekko"] },
      }),
      stubPrinting({
        shortCode: "RB-005",
        card: {
          name: "Kai'Sa, Survivor",
          type: "Unit",
          superTypes: ["Champion"],
          tags: ["Kai'Sa"],
        },
      }),
    ];

    it("assigns the first Champion card to the champion zone", () => {
      const entries: DeckImportEntry[] = [
        { cardName: "Kai'Sa, Survivor", quantity: 1, sourceSlot: "mainDeck", rawFields: {} },
        { cardName: "Iron Ballista", quantity: 3, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("champion");
      expect(result[1].zone).toBe("main");
    });

    it("only assigns the first Champion — others go to main", () => {
      const entries: DeckImportEntry[] = [
        { cardName: "Kai'Sa, Survivor", quantity: 1, sourceSlot: "mainDeck", rawFields: {} },
        { cardName: "Ekko, Recurrent", quantity: 3, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("champion");
      expect(result[1].zone).toBe("main");
    });

    it("splits multi-copy Champion: 1 to champion, rest to main", () => {
      const entries: DeckImportEntry[] = [
        { cardName: "Kai'Sa, Survivor", quantity: 3, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result).toHaveLength(2);
      expect(result[0].zone).toBe("champion");
      expect(result[0].entry.quantity).toBe(1);
      expect(result[1].zone).toBe("main");
      expect(result[1].entry.quantity).toBe(2);
    });

    it("does not auto-assign champion when an explicit champion zone exists", () => {
      const entries: DeckImportEntry[] = [
        {
          cardName: "Ekko, Recurrent",
          quantity: 1,
          sourceSlot: "chosenChampion",
          explicitZone: "champion",
          rawFields: {},
        },
        { cardName: "Kai'Sa, Survivor", quantity: 3, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("champion");
      expect(result[1].zone).toBe("main");
    });

    it("does not promote sideboard Champions to champion zone", () => {
      const entries: DeckImportEntry[] = [
        { cardName: "Kai'Sa, Survivor", quantity: 1, sourceSlot: "sideboard", rawFields: {} },
        { cardName: "Iron Ballista", quantity: 3, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("sideboard");
      expect(result[1].zone).toBe("main");
    });

    it("does not promote a Champion card whose zone was set explicitly (e.g. Legend:)", () => {
      const entries: DeckImportEntry[] = [
        {
          cardName: "Kai'Sa, Survivor",
          quantity: 1,
          sourceSlot: "mainDeck",
          explicitZone: "legend",
          rawFields: {},
        },
        { cardName: "Iron Ballista", quantity: 3, sourceSlot: "mainDeck", rawFields: {} },
      ];
      const result = matchDeckEntries(entries, catalog);
      expect(result[0].zone).toBe("legend");
      expect(result[1].zone).toBe("main");
    });
  });
});
