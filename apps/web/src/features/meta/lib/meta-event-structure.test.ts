import type { MetaEventPhase } from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import { metaMatch } from "@/test/meta-event-fixtures";

import { describeEventProgress, describeEventStructure } from "./meta-event-structure";

function phase(overrides: Partial<MetaEventPhase> = {}): MetaEventPhase {
  return {
    phaseOrder: 1,
    name: "Phase 1",
    roundType: "SWISS",
    roundCount: 6,
    rankRequired: null,
    maxGameWins: null,
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
      bestOf: null,
      sentence: "6 Swiss rounds, then a top 8 cut",
    });
  });

  it("names the games a match was played to when every phase agrees", () => {
    const structure = describeEventStructure([
      phase({ maxGameWins: 2 }),
      { ...cut, maxGameWins: 2 },
      phase({ phaseOrder: 3, roundType: "SINGLE_ELIMINATION", roundCount: 1, maxGameWins: 2 }),
    ]);
    expect(structure.bestOf).toBe(3);
    expect(structure.sentence).toBe("6 Swiss rounds, best of 3, then a top 8 cut");
  });

  it("places the games after a lone Swiss and after a lone cut", () => {
    expect(describeEventStructure([phase({ maxGameWins: 1 })]).sentence).toBe(
      "6 Swiss rounds, best of 1",
    );
    expect(
      describeEventStructure([cut, phase({ maxGameWins: 2, roundCount: null })]).sentence,
    ).toBe("Top 8 cut, best of 3");
  });

  it("says nothing about games when the phases disagree", () => {
    const structure = describeEventStructure([
      phase({ maxGameWins: 1 }),
      { ...cut, maxGameWins: 2 },
    ]);
    expect(structure.bestOf).toBeNull();
    expect(structure.sentence).toBe("6 Swiss rounds, then a top 8 cut");
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
      bestOf: null,
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
      bestOf: null,
      sentence: null,
    });
  });
});

describe("describeEventProgress", () => {
  it("says nothing before the first round is in", () => {
    expect(describeEventProgress([], [phase(), cut])).toBeNull();
  });

  it("counts the Swiss rounds on file against the rounds announced", () => {
    const matches = [1, 2, 3].map((roundNumber) => metaMatch({ phaseOrder: 1, roundNumber }));
    expect(describeEventProgress(matches, [phase(), cut])).toBe("After round 3 of 6");
  });

  it("leaves the total off when the source never announced one", () => {
    const matches = [metaMatch({ phaseOrder: 1, roundNumber: 1 })];
    expect(describeEventProgress(matches, [phase({ roundCount: null })])).toBe("After round 1");
  });

  it("names the cut once its first round is on file", () => {
    const matches = [metaMatch({ phaseOrder: 1, roundNumber: 6 }), metaMatch({ phaseOrder: 2 })];
    expect(describeEventProgress(matches, [phase(), cut])).toBe("Top 8 under way");
  });
});
