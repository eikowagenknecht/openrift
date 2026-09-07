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
  isOvernumbered: false,
  flavorText: "Boom.",
  printedRulesText: null,
  printedEffectText: null,
  printedName: "Jinx",
  language: "EN",
  hasImage: true,
};

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

const EN_NORMAL = "OGN-042:normal::EN";
const FR_NORMAL = "OGN-042:normal::FR";

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

  it("reports an overnumbered flag that disagrees with the catalog", () => {
    const diff = computeProposedDiff(
      {
        card: { name: "Jinx" },
        printings: [proposedPrinting({ isOvernumbered: true })],
      },
      liveSnapshot(),
    );
    expect(diff).toEqual([`printing.${EN_NORMAL}.isOvernumbered`]);
  });

  it("treats an unstated overnumbered flag as no proposal", () => {
    const diff = computeProposedDiff(
      {
        card: { name: "Jinx" },
        printings: [proposedPrinting({ isOvernumbered: null })],
      },
      liveSnapshot({ isOvernumbered: true }),
    );
    expect(diff).toEqual([]);
  });

  it("keeps a card's finishes and languages apart", () => {
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
    expect(diff).toEqual([`printing.${FR_NORMAL}.artist`]);
  });

  it("skips a printing that carries no finish", () => {
    const diff = computeProposedDiff(
      { card: { name: "Jinx" }, printings: [proposedPrinting({ finish: null, artist: "Nobody" })] },
      liveSnapshot(),
    );
    expect(diff).toEqual([]);
  });

  it("ignores casing and surrounding whitespace", () => {
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
