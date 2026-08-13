import { describe, expect, it } from "vitest";

import type {
  LivePrintingSnapshot,
  LiveSnapshot,
  ProposedPrinting,
} from "./card-submission-diff.js";
import { adoptedFields, computeProposedDiff } from "./card-submission-diff.js";

const LIVE_CARD = {
  name: "Jinx",
  type: "unit",
  might: 3,
  energy: 4,
  power: 2,
  mightBonus: null,
  tags: ["zaun"],
};

const LIVE_PRINTING: LivePrintingSnapshot = {
  rarity: "rare",
  artist: "Riot Games",
  artVariant: "standard",
  size: "standard",
  isSigned: false,
  flavorText: "Boom.",
  printedRulesText: null,
  printedEffectText: null,
  printedName: "Jinx",
  language: "EN",
  hasImage: true,
};

/**
 * @param overrides Fields to change from the live values.
 * @returns A proposed printing that otherwise matches {@link LIVE_PRINTING}.
 */
function proposedPrinting(overrides: Partial<ProposedPrinting> = {}): ProposedPrinting {
  return {
    shortCode: "OGN-042",
    finish: "normal",
    markerSlugs: [],
    rarity: "rare",
    artist: "Riot Games",
    artVariant: "standard",
    size: "standard",
    isSigned: false,
    flavorText: "Boom.",
    printedRulesText: null,
    printedEffectText: null,
    printedName: "Jinx",
    language: "EN",
    imageUrl: null,
    ...overrides,
  };
}

/** The printing key format, spelled out so the tests read as identities. */
const EN_NORMAL = "OGN-042:normal::EN";
const FR_NORMAL = "OGN-042:normal::FR";

/**
 * @param overrides Live-side overrides.
 * @returns A snapshot with the live card and one live printing.
 */
function liveSnapshot(overrides: Partial<LivePrintingSnapshot> = {}): LiveSnapshot {
  return {
    card: LIVE_CARD,
    printings: new Map([[EN_NORMAL, { ...LIVE_PRINTING, ...overrides }]]),
  };
}

describe("computeProposedDiff", () => {
  it("returns nothing when the submission matches the catalog", () => {
    const diff = computeProposedDiff(
      {
        card: { name: "Jinx", might: 3, energy: 4, power: 2, tags: ["zaun"] },
        printings: [proposedPrinting()],
      },
      liveSnapshot(),
    );
    expect(diff).toEqual([]);
  });

  it("reports only the fields that actually differ", () => {
    const diff = computeProposedDiff(
      {
        card: { name: "Jinx", energy: 5 },
        printings: [proposedPrinting({ artist: "Someone Else" })],
      },
      liveSnapshot(),
    );
    expect(diff).toEqual(["card.energy", `printing.${EN_NORMAL}.artist`]);
  });

  it("keeps a card's finishes and languages apart", () => {
    // Regression: eight printings of one card share the short code OGN-002 and
    // differ only by finish and language. Keying the live side by short code
    // collapsed them onto one row, so the French printing phantom-differed on
    // language and an artist fix accepted on the English one went unnoticed —
    // the submission read not_applied despite the admin having applied it.
    const live: LiveSnapshot = {
      card: LIVE_CARD,
      printings: new Map([
        [EN_NORMAL, { ...LIVE_PRINTING, artist: "Fixed Artist" }],
        [FR_NORMAL, { ...LIVE_PRINTING, printedName: "Jinx (FR)" }],
      ]),
    };
    const diff = computeProposedDiff(
      {
        card: { name: "Jinx" },
        printings: [
          proposedPrinting({ language: "EN", artist: "Fixed Artist" }),
          proposedPrinting({ language: "FR", printedName: "Jinx (FR)", artist: "Someone Else" }),
        ],
      },
      live,
    );
    // Only the French artist differs. Nothing is reported against the English
    // row, and no language entry appears for either.
    expect(diff).toEqual([`printing.${FR_NORMAL}.artist`]);
  });

  it("skips a printing that carries no finish", () => {
    // It cannot be told apart from its siblings, and calling it new would add a
    // field that can never be adopted, pinning the submission to not_applied.
    const diff = computeProposedDiff(
      { card: { name: "Jinx" }, printings: [proposedPrinting({ finish: null, artist: "Nobody" })] },
      liveSnapshot(),
    );
    expect(diff).toEqual([]);
  });

  it("ignores casing and surrounding whitespace", () => {
    // A contributor typing "riot games" is not proposing a change, and counting
    // it as one would credit them for a correction nobody made.
    const diff = computeProposedDiff(
      { card: { name: "  jinx " }, printings: [proposedPrinting({ artist: "riot games" })] },
      liveSnapshot(),
    );
    expect(diff).toEqual([]);
  });

  it("treats a blank value as no proposal rather than as a clear", () => {
    const diff = computeProposedDiff(
      {
        card: { name: "Jinx", might: null, energy: undefined },
        printings: [proposedPrinting({ flavorText: null })],
      },
      liveSnapshot(),
    );
    expect(diff).toEqual([]);
  });

  it("marks the whole card new when nothing matched", () => {
    const diff = computeProposedDiff(
      { card: { name: "Brand New" }, printings: [proposedPrinting({ shortCode: "OGN-999" })] },
      { card: null, printings: new Map() },
    );
    expect(diff).toEqual(["card.new", "printing.OGN-999:normal::EN.new"]);
  });

  it("matches printings case-insensitively on the short code", () => {
    const diff = computeProposedDiff(
      {
        card: { name: "Jinx" },
        printings: [proposedPrinting({ shortCode: "ogn-042", rarity: "epic" })],
      },
      liveSnapshot(),
    );
    expect(diff).toEqual([`printing.${EN_NORMAL}.rarity`]);
  });

  it("counts an image only when the printing has none", () => {
    const withoutArt = computeProposedDiff(
      {
        card: { name: "Jinx" },
        printings: [proposedPrinting({ imageUrl: "https://example.test/j.png" })],
      },
      liveSnapshot({ hasImage: false }),
    );
    expect(withoutArt).toEqual([`printing.${EN_NORMAL}.image`]);
  });

  it("counts no change when the printing already has artwork", () => {
    // We cannot verify a replacement image by comparison, so this resolves as
    // already_correct rather than as an accept nobody made.
    const withArt = computeProposedDiff(
      {
        card: { name: "Jinx" },
        printings: [proposedPrinting({ imageUrl: "https://example.test/j.png" })],
      },
      liveSnapshot({ hasImage: true }),
    );
    expect(withArt).toEqual([]);
  });

  it("compares tags order-insensitively", () => {
    const same = computeProposedDiff(
      { card: { name: "Jinx", tags: ["ZAUN"] }, printings: [] },
      liveSnapshot(),
    );
    expect(same).toEqual([]);

    const different = computeProposedDiff(
      { card: { name: "Jinx", tags: ["zaun", "sniper"] }, printings: [] },
      liveSnapshot(),
    );
    expect(different).toEqual(["card.tags"]);
  });
});

describe("adoptedFields", () => {
  it("returns the fields the catalog has since agreed with", () => {
    expect(adoptedFields(["card.energy", "card.might"], ["card.might"])).toEqual(["card.energy"]);
  });

  it("returns nothing when the catalog still disagrees with everything", () => {
    expect(adoptedFields(["card.energy"], ["card.energy"])).toEqual([]);
  });

  it("returns everything when the catalog now agrees fully", () => {
    expect(adoptedFields(["card.energy", "card.name"], [])).toEqual(["card.energy", "card.name"]);
  });
});
