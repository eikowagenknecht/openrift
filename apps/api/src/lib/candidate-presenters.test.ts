import { describe, expect, it } from "vitest";

import type { CandidateCardRow, CandidatePrintingRow } from "./candidate-presenters.js";
import { formatCandidateCard, formatCandidatePrinting } from "./candidate-presenters.js";

const CARD_ROW: CandidateCardRow = {
  id: "candidate-1",
  provider: "riot",
  name: "Yasuo, Windchaser",
  types: ["unit"],
  superTypes: ["champion"],
  domains: ["fury"],
  might: 4,
  energy: 3,
  power: 2,
  mightBonus: null,
  rulesText: "Deals 1 damage on play.",
  effectText: null,
  tags: ["ionia"],
  shortCode: "OGN-042",
  externalId: "ext-42",
  extraData: { rawRarity: "epic" },
  checkedAt: new Date("2026-08-15T23:59:07.250Z"),
  submittedByUserId: "user-1",
  submissionNote: "Spotted in a prerelease pack.",
  submittedByName: "Poppy",
};

const PRINTING_ROW: CandidatePrintingRow = {
  id: "candidate-printing-1",
  candidateCardId: "candidate-1",
  printingId: null,
  shortCode: "OGN-042",
  setId: "ogn",
  setName: "Origins",
  rarity: "epic",
  artVariant: "alternate",
  isSigned: false,
  isOvernumbered: false,
  markerSlugs: ["foil-stamp"],
  distributionChannelSlugs: ["prerelease"],
  finish: "foil",
  size: "standard",
  artist: "Anon Artist",
  publicCode: "OGN-042-ALT",
  printedRulesText: "Deals 1 damage on play.",
  printedEffectText: null,
  imageUrl: "https://images.example.test/ogn-042-alt.png",
  flavorText: "The wind knows.",
  language: "en",
  printedName: "Yasuo, Windchaser",
  printedYear: 2026,
  externalId: "ext-42-alt",
  extraData: null,
  checkedAt: new Date("2026-08-15T23:59:07.250Z"),
};

describe("formatCandidateCard", () => {
  it("renders checkedAt as ISO 8601 and passes every other column through", () => {
    expect(formatCandidateCard(CARD_ROW)).toEqual({
      ...CARD_ROW,
      checkedAt: "2026-08-15T23:59:07.250Z",
    });
  });

  it("keeps an unchecked candidate's checkedAt null", () => {
    expect(formatCandidateCard({ ...CARD_ROW, checkedAt: null }).checkedAt).toBeNull();
  });
});

describe("formatCandidatePrinting", () => {
  it("renders checkedAt as ISO 8601 and passes every other column through", () => {
    expect(formatCandidatePrinting(PRINTING_ROW)).toEqual({
      ...PRINTING_ROW,
      checkedAt: "2026-08-15T23:59:07.250Z",
    });
  });

  it("keeps an unchecked printing's checkedAt null", () => {
    expect(formatCandidatePrinting({ ...PRINTING_ROW, checkedAt: null }).checkedAt).toBeNull();
  });
});
