import { describe, expect, it } from "vitest";

import { parseDeckImportData } from "./deck-import-parsers";
import { buildSampleDeckCards, SAMPLE_DECK_CODE, sampleDeckKeyCards } from "./sample-deck";

describe("sample deck", () => {
  it("bundles a deck code that decodes into entries", () => {
    const { entries, warnings } = parseDeckImportData(SAMPLE_DECK_CODE, "piltover");
    expect(warnings).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("returns null instead of a partial deck when the catalog can't resolve the code", () => {
    expect(buildSampleDeckCards([])).toBeNull();
  });
});

describe("sampleDeckKeyCards", () => {
  it("picks the legend and champion rows", () => {
    const legend = { cardId: "l", zone: "legend", quantity: 1, preferredPrintingId: null };
    const champion = { cardId: "c", zone: "champion", quantity: 1, preferredPrintingId: "p1" };
    const main = { cardId: "m", zone: "main", quantity: 3, preferredPrintingId: null };
    const result = sampleDeckKeyCards([main, legend, champion] as never);
    expect(result.legend?.cardId).toBe("l");
    expect(result.champion?.preferredPrintingId).toBe("p1");
  });

  it("returns nulls when zones are absent", () => {
    expect(sampleDeckKeyCards([])).toEqual({ legend: null, champion: null });
  });
});
