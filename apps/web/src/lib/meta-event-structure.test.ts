import type { MetaEventPhase } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { describeEventStructure } from "./meta-event-structure";

function phase(overrides: Partial<MetaEventPhase> = {}): MetaEventPhase {
  return {
    phaseOrder: 1,
    name: "Phase 1",
    roundType: "SWISS",
    roundCount: 6,
    rankRequired: null,
    ...overrides,
  };
}

const cut = phase({
  phaseOrder: 2,
  name: "Phase 2",
  roundType: "RANKED_SINGLE_ELIMINATION",
  roundCount: 3,
  rankRequired: 8,
});

describe("describeEventStructure", () => {
  it("reads the Swiss rounds and the cut an event published both of", () => {
    expect(describeEventStructure([phase(), cut])).toEqual({
      swissRounds: 6,
      cutSize: 8,
      sentence: "6 Swiss rounds, then a top 8 cut",
    });
  });

  it("sums the rounds of an event that ran its Swiss over two days", () => {
    const structure = describeEventStructure([
      phase({ roundCount: 8 }),
      phase({ phaseOrder: 2, roundCount: 5 }),
    ]);
    expect(structure.swissRounds).toBe(13);
    expect(structure.sentence).toBe("13 Swiss rounds");
  });

  it("says round in the singular for a one-round event", () => {
    expect(describeEventStructure([phase({ roundCount: 1 })]).sentence).toBe("1 Swiss round");
  });

  it("opens the sentence with the cut when no Swiss preceded it", () => {
    expect(describeEventStructure([cut])).toEqual({
      swissRounds: null,
      cutSize: 8,
      sentence: "Top 8 cut",
    });
  });

  it("sizes a cut with no entry rank from the rounds it takes to win", () => {
    const structure = describeEventStructure([
      cut,
      phase({ roundType: "SINGLE_ELIMINATION", roundCount: 4, rankRequired: null }),
    ]);
    expect(structure.cutSize).toBe(16);
  });

  it("keeps the cut's own size when a third-place phase sits beside it", () => {
    const bronze = phase({
      phaseOrder: 3,
      roundType: "SINGLE_ELIMINATION",
      roundCount: 1,
      rankRequired: null,
    });
    expect(describeEventStructure([cut, bronze]).cutSize).toBe(8);
  });

  it("ignores a Swiss phase whose round count no source published", () => {
    expect(describeEventStructure([phase({ roundCount: null })]).swissRounds).toBeNull();
  });

  it("describes nothing for an event with no phase list", () => {
    expect(describeEventStructure([])).toEqual({
      swissRounds: null,
      cutSize: null,
      sentence: null,
    });
  });
});
