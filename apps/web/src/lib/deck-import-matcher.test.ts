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
});
