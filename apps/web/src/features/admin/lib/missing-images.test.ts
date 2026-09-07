import type { MissingImageCard } from "@openrift/shared/types/api/admin";
import { describe, expect, it } from "vitest";

import {
  filterMissingImagesByLanguage,
  summarizeMissingImagesByLanguage,
} from "@/features/admin/lib/missing-images";

const ORDER = ["EN", "DE", "FR"];

const CARDS: MissingImageCard[] = [
  {
    cardId: "card-1",
    slug: "OGN-001",
    name: "Annie",
    byLanguage: [
      { language: "DE", count: 2 },
      { language: "EN", count: 1 },
    ],
  },
  {
    cardId: "card-2",
    slug: "OGN-002",
    name: "Jinx",
    byLanguage: [{ language: "DE", count: 3 }],
  },
];

describe("summarizeMissingImagesByLanguage", () => {
  it("counts cards and printings per language", () => {
    expect(summarizeMissingImagesByLanguage(CARDS, ORDER)).toEqual([
      { language: "EN", cards: 1, printings: 1 },
      { language: "DE", cards: 2, printings: 5 },
    ]);
  });

  it("returns an empty list for no cards", () => {
    expect(summarizeMissingImagesByLanguage([], ORDER)).toEqual([]);
  });

  it("sorts unknown languages last, alphabetically", () => {
    const cards: MissingImageCard[] = [
      {
        cardId: "card-3",
        slug: "OGN-003",
        name: "Yasuo",
        byLanguage: [
          { language: "ZZ", count: 1 },
          { language: "KO", count: 1 },
          { language: "EN", count: 1 },
        ],
      },
    ];

    expect(summarizeMissingImagesByLanguage(cards, ORDER).map((s) => s.language)).toEqual([
      "EN",
      "KO",
      "ZZ",
    ]);
  });
});

describe("filterMissingImagesByLanguage", () => {
  it("returns every card unchanged when no language is selected", () => {
    expect(filterMissingImagesByLanguage(CARDS, null)).toEqual(CARDS);
  });

  it("keeps only cards missing that language, with the other languages dropped", () => {
    expect(filterMissingImagesByLanguage(CARDS, "EN")).toEqual([
      {
        cardId: "card-1",
        slug: "OGN-001",
        name: "Annie",
        byLanguage: [{ language: "EN", count: 1 }],
      },
    ]);
  });

  it("returns an empty list for a language nothing is missing in", () => {
    expect(filterMissingImagesByLanguage(CARDS, "FR")).toEqual([]);
  });
});
