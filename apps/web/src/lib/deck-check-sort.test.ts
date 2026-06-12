import { describe, expect, it } from "vitest";

import { sortDeckCheckCards } from "./deck-check-sort";
import type { DeckCheckCardIdentity } from "./deck-check-sort";

interface TestCard {
  sortOrder: number;
  rawName: string;
  resolvedPrintingId: string | null;
}

const catalogue: Record<string, DeckCheckCardIdentity> = {
  "p-zed": { name: "Zed", shortCode: "OGN-200", domains: ["mind"] },
  "p-ahri": { name: "Ahri", shortCode: "OGN-010", domains: ["fury"] },
  "p-jinx": { name: "Jinx", shortCode: "OGN-100", domains: ["fury", "mind"] },
};

const DOMAIN_ORDER = ["fury", "calm", "mind", "body", "chaos", "order", "colorless"];

const identify = (printingId: string | null): DeckCheckCardIdentity | undefined =>
  printingId ? catalogue[printingId] : undefined;

const cards: TestCard[] = [
  { sortOrder: 0, rawName: "Zed", resolvedPrintingId: "p-zed" },
  { sortOrder: 1, rawName: "Ahri", resolvedPrintingId: "p-ahri" },
  { sortOrder: 2, rawName: "Jinx", resolvedPrintingId: "p-jinx" },
];

const names = (result: TestCard[]) => result.map((card) => card.rawName);

describe("sortDeckCheckCards", () => {
  it("keeps import order for the 'deck' sort regardless of direction", () => {
    expect(names(sortDeckCheckCards(cards, "deck", "asc", identify))).toEqual([
      "Zed",
      "Ahri",
      "Jinx",
    ]);
    expect(names(sortDeckCheckCards(cards, "deck", "desc", identify))).toEqual([
      "Zed",
      "Ahri",
      "Jinx",
    ]);
  });

  it("sorts by catalogue name ascending and descending", () => {
    expect(names(sortDeckCheckCards(cards, "name", "asc", identify))).toEqual([
      "Ahri",
      "Jinx",
      "Zed",
    ]);
    expect(names(sortDeckCheckCards(cards, "name", "desc", identify))).toEqual([
      "Zed",
      "Jinx",
      "Ahri",
    ]);
  });

  it("sorts by short code for the 'id' sort", () => {
    expect(names(sortDeckCheckCards(cards, "id", "asc", identify))).toEqual([
      "Ahri",
      "Jinx",
      "Zed",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [...cards];
    sortDeckCheckCards(input, "name", "asc", identify);
    expect(names(input)).toEqual(["Zed", "Ahri", "Jinx"]);
  });

  it("falls back to the raw name when a line has no matched printing", () => {
    const withUnmatched: TestCard[] = [
      { sortOrder: 0, rawName: "Zed", resolvedPrintingId: "p-zed" },
      { sortOrder: 1, rawName: "Aatrox", resolvedPrintingId: null },
    ];
    expect(names(sortDeckCheckCards(withUnmatched, "name", "asc", identify))).toEqual([
      "Aatrox",
      "Zed",
    ]);
  });

  it("pins unmatched lines to the end of the 'id' sort in both directions", () => {
    const withUnmatched: TestCard[] = [
      { sortOrder: 0, rawName: "Unknown A", resolvedPrintingId: null },
      { sortOrder: 1, rawName: "Ahri", resolvedPrintingId: "p-ahri" },
      { sortOrder: 2, rawName: "Unknown B", resolvedPrintingId: null },
      { sortOrder: 3, rawName: "Zed", resolvedPrintingId: "p-zed" },
    ];
    expect(names(sortDeckCheckCards(withUnmatched, "id", "asc", identify))).toEqual([
      "Ahri",
      "Zed",
      "Unknown A",
      "Unknown B",
    ]);
    expect(names(sortDeckCheckCards(withUnmatched, "id", "desc", identify))).toEqual([
      "Zed",
      "Ahri",
      "Unknown A",
      "Unknown B",
    ]);
  });

  it("sorts by domain order first, then name, for the 'domain' sort", () => {
    // Fury (Ahri) → Fury/Mind dual (Jinx) → Mind (Zed); mono before dual on
    // the same first domain, name as the within-domain tiebreaker.
    expect(names(sortDeckCheckCards(cards, "domain", "asc", identify, DOMAIN_ORDER))).toEqual([
      "Ahri",
      "Jinx",
      "Zed",
    ]);
    expect(names(sortDeckCheckCards(cards, "domain", "desc", identify, DOMAIN_ORDER))).toEqual([
      "Zed",
      "Jinx",
      "Ahri",
    ]);
  });

  it("orders mono-domain cards before duals sharing the first domain", () => {
    const monoAndDual: TestCard[] = [
      { sortOrder: 0, rawName: "Jinx", resolvedPrintingId: "p-jinx" },
      { sortOrder: 1, rawName: "Ahri", resolvedPrintingId: "p-ahri" },
    ];
    expect(names(sortDeckCheckCards(monoAndDual, "domain", "asc", identify, DOMAIN_ORDER))).toEqual(
      ["Ahri", "Jinx"],
    );
  });

  it("sorts by name within the same domain for the 'domain' sort", () => {
    const sameDomain: Record<string, DeckCheckCardIdentity> = {
      "p-a": { name: "Annie", shortCode: "OGN-001", domains: ["fury"] },
      "p-b": { name: "Brand", shortCode: "OGN-002", domains: ["fury"] },
    };
    const sameDomainIdentify = (printingId: string | null) =>
      printingId ? sameDomain[printingId] : undefined;
    const furyCards: TestCard[] = [
      { sortOrder: 0, rawName: "Brand", resolvedPrintingId: "p-b" },
      { sortOrder: 1, rawName: "Annie", resolvedPrintingId: "p-a" },
    ];
    expect(
      names(sortDeckCheckCards(furyCards, "domain", "asc", sameDomainIdentify, DOMAIN_ORDER)),
    ).toEqual(["Annie", "Brand"]);
  });

  it("pins unmatched lines to the end of the 'domain' sort in both directions", () => {
    const withUnmatched: TestCard[] = [
      { sortOrder: 0, rawName: "Unknown A", resolvedPrintingId: null },
      { sortOrder: 1, rawName: "Zed", resolvedPrintingId: "p-zed" },
      { sortOrder: 2, rawName: "Unknown B", resolvedPrintingId: null },
      { sortOrder: 3, rawName: "Ahri", resolvedPrintingId: "p-ahri" },
    ];
    expect(
      names(sortDeckCheckCards(withUnmatched, "domain", "asc", identify, DOMAIN_ORDER)),
    ).toEqual(["Ahri", "Zed", "Unknown A", "Unknown B"]);
    expect(
      names(sortDeckCheckCards(withUnmatched, "domain", "desc", identify, DOMAIN_ORDER)),
    ).toEqual(["Zed", "Ahri", "Unknown A", "Unknown B"]);
  });

  it("ranks domains missing from the order list after known domains", () => {
    const exotic: Record<string, DeckCheckCardIdentity> = {
      "p-known": { name: "Known", shortCode: "OGN-001", domains: ["fury"] },
      "p-exotic": { name: "Exotic", shortCode: "OGN-002", domains: ["void"] },
    };
    const exoticIdentify = (printingId: string | null) =>
      printingId ? exotic[printingId] : undefined;
    const mixed: TestCard[] = [
      { sortOrder: 0, rawName: "Exotic", resolvedPrintingId: "p-exotic" },
      { sortOrder: 1, rawName: "Known", resolvedPrintingId: "p-known" },
    ];
    expect(names(sortDeckCheckCards(mixed, "domain", "asc", exoticIdentify, DOMAIN_ORDER))).toEqual(
      ["Known", "Exotic"],
    );
  });

  it("breaks ties by import order", () => {
    const dupes: TestCard[] = [
      { sortOrder: 2, rawName: "Ahri", resolvedPrintingId: "p-ahri" },
      { sortOrder: 0, rawName: "Ahri", resolvedPrintingId: "p-ahri" },
      { sortOrder: 1, rawName: "Ahri", resolvedPrintingId: "p-ahri" },
    ];
    expect(
      sortDeckCheckCards(dupes, "name", "asc", identify).map((card) => card.sortOrder),
    ).toEqual([0, 1, 2]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortDeckCheckCards([], "name", "asc", identify)).toEqual([]);
  });
});
