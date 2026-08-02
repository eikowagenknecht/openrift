import { describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { buildEntryAdvisories, computeZoneSuggestions } from "./deck-check-advisories.js";
import type { AdvisoryCardLine } from "./deck-check-advisories.js";

/**
 * Builds a matched, persisted card line with sensible defaults.
 * @returns An advisory card line for {@link computeZoneSuggestions}.
 */
function line(overrides: Partial<AdvisoryCardLine> = {}): AdvisoryCardLine {
  return {
    id: "row-1",
    rawName: "Some Card",
    zone: "main",
    quantity: 1,
    resolvedCardId: "card-1",
    matchStatus: "matched",
    ...overrides,
  };
}

const details = new Map([
  ["legend-card", { name: "A Legend", type: "legend", types: ["legend"], superTypes: [] }],
  ["rune-card", { name: "A Rune", type: "rune", types: ["rune"], superTypes: [] }],
  [
    "battlefield-card",
    { name: "A Battlefield", type: "battlefield", types: ["battlefield"], superTypes: [] },
  ],
  ["unit-card", { name: "A Unit", type: "unit", types: ["unit"], superTypes: [] }],
  ["spell-card", { name: "A Spell", type: "spell", types: ["spell"], superTypes: [] }],
]);

describe("computeZoneSuggestions", () => {
  it("suggests the type-locked zone for Legend, Rune, and Battlefield cards dumped in main", () => {
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "legend-card" }),
        line({ id: "b", resolvedCardId: "rune-card" }),
        line({ id: "c", resolvedCardId: "battlefield-card" }),
      ],
      details,
    );
    expect(suggestions).toEqual([
      { cardId: "a", cardName: "A Legend", currentZone: "main", suggestedZone: "legend" },
      { cardId: "b", cardName: "A Rune", currentZone: "main", suggestedZone: "runes" },
      {
        cardId: "c",
        cardName: "A Battlefield",
        currentZone: "main",
        suggestedZone: "battlefield",
      },
    ]);
  });

  it("catches a type-locked card mis-zoned into any wrong zone, not just main", () => {
    const suggestions = computeZoneSuggestions(
      [line({ id: "a", resolvedCardId: "rune-card", zone: "sideboard" })],
      details,
    );
    expect(suggestions).toEqual([
      { cardId: "a", cardName: "A Rune", currentZone: "sideboard", suggestedZone: "runes" },
    ]);
  });

  it("moves a card wrongly parked in a type-locked zone back to main", () => {
    // A type-locked zone accepts only its one type, so a Spell in battlefield is
    // unambiguously misplaced; main is the safe default destination.
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "spell-card", zone: "battlefield" }),
        line({ id: "b", resolvedCardId: "unit-card", zone: "legend" }),
      ],
      details,
    );
    expect(suggestions).toEqual([
      { cardId: "a", cardName: "A Spell", currentZone: "battlefield", suggestedZone: "main" },
      { cardId: "b", cardName: "A Unit", currentZone: "legend", suggestedZone: "main" },
    ]);
  });

  it("never proposes moving an ordinary card among the non-locked zones", () => {
    // None of main / sideboard / champion / overflow is type-locked, so a Unit's
    // placement there is a deckbuilding choice and is left untouched.
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "unit-card", zone: "main" }),
        line({ id: "b", resolvedCardId: "unit-card", zone: "sideboard" }),
        line({ id: "c", resolvedCardId: "unit-card", zone: "champion" }),
        line({ id: "d", resolvedCardId: "unit-card", zone: "overflow" }),
      ],
      details,
    );
    expect(suggestions).toEqual([]);
  });

  it("leaves a type-locked card that is already in the right zone alone", () => {
    const suggestions = computeZoneSuggestions(
      [line({ id: "a", resolvedCardId: "legend-card", zone: "legend" })],
      details,
    );
    expect(suggestions).toEqual([]);
  });

  it("skips unmatched lines, preview lines without an id, and lines with no catalog detail", () => {
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "legend-card", matchStatus: "unmatched" }),
        line({ id: undefined, resolvedCardId: "rune-card" }),
        line({ id: "c", resolvedCardId: "missing-card" }),
      ],
      details,
    );
    expect(suggestions).toEqual([]);
  });
});

describe("buildEntryAdvisories", () => {
  interface StubCardDetail {
    id: string;
    name: string;
    type: string;
    types: string[];
    superTypes: string[];
    domains: string[];
    tags: string[];
    keywords: string[];
  }

  /**
   * Builds a repos stub carrying just the calls buildEntryAdvisories
   * makes; everything else is absent and would throw if touched.
   * @returns A minimal Repos double.
   */
  function stubRepos(
    cardDetails: Map<string, StubCardDetail>,
    championTags: string[] | null,
  ): Repos {
    return {
      enums: {
        all: () => Promise.resolve({ cardTypes: [], domains: [] }),
      },
      deckCheck: {
        getCardDetails: () => Promise.resolve(cardDetails),
        getCardSetSlugs: () => Promise.resolve(new Map<string, string[]>()),
      },
      cardBans: {
        listActiveForCards: () => Promise.resolve([]),
      },
      catalog: {
        championIdentifierTags: () => {
          if (championTags === null) {
            throw new Error("championIdentifierTags must not be queried for this format");
          }
          return Promise.resolve(championTags);
        },
      },
    } as unknown as Repos;
  }

  it("feeds the champion-identifier tags into custom-region validation", async () => {
    // A Daisy! signature without its Ivern champion — the copies rule must
    // fire, which only happens when the tag set reaches validateDeck.
    const cardDetails = new Map<string, StubCardDetail>([
      [
        "legend-karma",
        {
          id: "legend-karma",
          name: "Karma",
          type: "legend",
          types: ["legend"],
          superTypes: [],
          domains: [],
          tags: ["Karma"],
          keywords: [],
        },
      ],
      [
        "sig-daisy",
        {
          id: "sig-daisy",
          name: "Daisy!",
          type: "unit",
          types: ["unit"],
          superTypes: ["signature"],
          domains: [],
          tags: ["Ivern", "Ionia"],
          keywords: [],
        },
      ],
    ]);
    const advisories = await buildEntryAdvisories(
      stubRepos(cardDetails, ["Karma", "Ivern"]),
      { format: "custom-region", playMode: "1v1" as const, allowedSets: null },
      [
        line({ id: "a", resolvedCardId: "legend-karma", zone: "legend" }),
        line({ id: "b", resolvedCardId: "sig-daisy", zone: "main" }),
      ],
    );
    const codes = advisories.violations.map((violation) => violation.code);
    expect(codes).toContain("SIGNATURE_CHAMPION_COPIES");
  });

  it("does not query champion tags for non-custom-region formats", async () => {
    // The stub throws if championIdentifierTags is called at all.
    const advisories = await buildEntryAdvisories(
      stubRepos(new Map(), null),
      { format: "constructed", playMode: "1v1" as const, allowedSets: null },
      [],
    );
    expect(advisories.violations.some((v) => v.code === "SIGNATURE_CHAMPION_COPIES")).toBe(false);
  });

  it("suppresses the region-config rules a checked list can't satisfy", async () => {
    // A checked list is an imported text deck: it carries neither the deck's
    // chosen region tags nor per-card custom tags, so FORMAT_TAG_REQUIRED
    // ("Pick at least one region…") would fire on EVERY custom-region deck
    // check as judge-facing noise. Other rules must still evaluate.
    const cardDetails = new Map<string, StubCardDetail>([
      [
        "legend-karma",
        {
          id: "legend-karma",
          name: "Karma",
          type: "legend",
          types: ["legend"],
          superTypes: [],
          domains: [],
          tags: ["Karma"],
          keywords: [],
        },
      ],
    ]);
    const advisories = await buildEntryAdvisories(
      stubRepos(cardDetails, []),
      { format: "custom-region", playMode: "1v1" as const, allowedSets: null },
      [line({ id: "a", resolvedCardId: "legend-karma", zone: "legend" })],
    );
    const codes = advisories.violations.map((violation) => violation.code);
    expect(codes).not.toContain("FORMAT_TAG_REQUIRED");
    expect(codes).not.toContain("CARD_NOT_IN_FORMAT_TAG");
    // Sanity: real structural rules still fire (no champion, no runes, …).
    expect(codes.length).toBeGreaterThan(0);
  });
});
