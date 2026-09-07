import type { MetaEventMatch, MetaEventPhase } from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import { metaEventBracket } from "./meta-bracket";

function match(overrides: Partial<MetaEventMatch> = {}): MetaEventMatch {
  return {
    phaseOrder: 2,
    roundNumber: 1,
    tableNumber: 1,
    isBye: false,
    isDraw: false,
    player1Id: "p1",
    player2Id: "p2",
    winnerId: "p1",
    gamesWonP1: 2,
    gamesWonP2: 0,
    ...overrides,
  };
}

function phase(overrides: Partial<MetaEventPhase> = {}): MetaEventPhase {
  return {
    phaseOrder: 2,
    name: "Phase 3",
    roundType: "RANKED_SINGLE_ELIMINATION",
    roundCount: 3,
    rankRequired: 8,
    maxGameWins: null,
    ...overrides,
  };
}

const SWISS = phase({ phaseOrder: 1, name: "Phase 1", roundType: "SWISS", rankRequired: null });

/** One round of `count` matches, with tables and players numbered apart. */
function round(roundNumber: number, count: number, phaseOrder = 2): MetaEventMatch[] {
  return Array.from({ length: count }, (_, index) =>
    match({
      phaseOrder,
      roundNumber,
      tableNumber: index + 1,
      player1Id: `r${roundNumber}-a${index}`,
      player2Id: `r${roundNumber}-b${index}`,
      winnerId: `r${roundNumber}-a${index}`,
    }),
  );
}

const TOP_8 = [...round(1, 4), ...round(2, 2), ...round(3, 1)];

describe("metaEventBracket with the source's phase list", () => {
  it("titles the cut from the standing that entered it", () => {
    expect(metaEventBracket(TOP_8, [SWISS, phase()])?.title).toBe("Top 8");
  });

  it("reads a top 8 as quarterfinals, semifinals, and a final", () => {
    const bracket = metaEventBracket(TOP_8, [SWISS, phase()]);
    expect(bracket?.rounds.map((entry) => entry.label)).toEqual([
      "Quarterfinals",
      "Semifinals",
      "Final",
    ]);
    expect(bracket?.rounds.map((entry) => entry.matches.length)).toEqual([4, 2, 1]);
  });

  it("names a cut deeper than a quarterfinal by its size", () => {
    const deep = [...round(1, 8), ...round(2, 4), ...round(3, 2), ...round(4, 1)];
    expect(metaEventBracket(deep, [phase({ rankRequired: 16 })])?.rounds[0]!.label).toBe("Top 16");
  });

  it("ignores the swiss phase, however its rounds happen to thin out", () => {
    const thinningSwiss = [...round(1, 4, 1), ...round(2, 2, 1), ...round(3, 1, 1)];
    const bracket = metaEventBracket(
      [...thinningSwiss, ...round(1, 2), ...round(2, 1)],
      [SWISS, phase()],
    );

    expect(bracket?.rounds).toHaveLength(2);
    expect(bracket?.rounds[0]!.matches).toHaveLength(2);
  });

  it("renders no bracket for an event that only ever played swiss", () => {
    expect(metaEventBracket([...round(1, 4, 1), ...round(2, 2, 1)], [SWISS])).toBeNull();
  });

  it("keeps a bronze match beside the final instead of losing the whole bracket", () => {
    const withBronze = [
      ...round(1, 2),
      match({ roundNumber: 2, tableNumber: 1, player1Id: "a", player2Id: "b", winnerId: "a" }),
      match({ roundNumber: 2, tableNumber: 2, player1Id: "c", player2Id: "d", winnerId: "c" }),
    ];
    const bracket = metaEventBracket(withBronze, [phase({ rankRequired: 4 })]);

    expect(bracket?.title).toBe("Top 4");
    expect(bracket?.rounds.map((entry) => entry.label)).toEqual(["Semifinals", "Final"]);
    expect(bracket?.rounds[1]!.matches).toHaveLength(2);
    expect(bracket?.rounds[1]!.isFinal).toBe(false);
  });

  it("picks the main cut over a third-place playoff filed as its own phase", () => {
    const bronzePhase = phase({ phaseOrder: 3, name: "Phase 4", rankRequired: 4 });
    const bracket = metaEventBracket(
      [...TOP_8, match({ phaseOrder: 3, roundNumber: 1, player1Id: "x", player2Id: "y" })],
      [SWISS, phase(), bronzePhase],
    );

    expect(bracket?.title).toBe("Top 8");
    expect(bracket?.rounds).toHaveLength(3);
  });

  it("titles a partly published cut by its real size, not by what was published", () => {
    const bracket = metaEventBracket([...round(2, 2), ...round(3, 1)], [phase()]);
    expect(bracket?.title).toBe("Top 8");
    expect(bracket?.rounds.map((entry) => entry.label)).toEqual(["Semifinals", "Final"]);
  });

  it("shows a cut published down to its final alone, since the size names it", () => {
    const bracket = metaEventBracket(round(3, 1), [phase()]);
    expect(bracket?.title).toBe("Top 8");
    expect(bracket?.rounds.map((entry) => entry.label)).toEqual(["Final"]);
  });

  it("ignores a phase the source declared but published no matches for", () => {
    expect(metaEventBracket([], [phase()])).toBeNull();
  });

  it("marks the decisive round, and only that one", () => {
    const bracket = metaEventBracket(TOP_8, [phase()]);
    expect(bracket?.rounds.map((entry) => entry.isFinal)).toEqual([false, false, true]);
  });
});

describe("metaEventBracket without a phase list", () => {
  it("reads a top 8 out of the shape of its rounds", () => {
    const bracket = metaEventBracket(TOP_8, []);
    expect(bracket?.title).toBe("Top 8");
    expect(bracket?.rounds.map((entry) => entry.label)).toEqual([
      "Quarterfinals",
      "Semifinals",
      "Final",
    ]);
  });

  it("reads a top 4 as semifinals and a final", () => {
    const bracket = metaEventBracket([...round(1, 2), ...round(2, 1)], []);
    expect(bracket?.title).toBe("Top 4");
  });

  it("ignores the swiss phase below the cut", () => {
    const bracket = metaEventBracket(
      [...round(1, 16, 1), ...round(2, 16, 1), ...round(1, 2), ...round(2, 1)],
      [],
    );
    expect(bracket?.rounds).toHaveLength(2);
  });

  it("renders no bracket for an event that only ever played swiss", () => {
    expect(metaEventBracket([...round(1, 16, 1), ...round(2, 16, 1)], [])).toBeNull();
  });

  it("renders no bracket for a lone recorded final", () => {
    expect(metaEventBracket(round(1, 1), [])).toBeNull();
  });

  it("renders no bracket when a round does not halve into the next", () => {
    expect(metaEventBracket([...round(1, 3), ...round(2, 1)], [])).toBeNull();
  });

  it("renders no bracket when the last round holds more than one match", () => {
    expect(metaEventBracket([...round(1, 4), ...round(2, 2)], [])).toBeNull();
  });

  it("renders no bracket for an event with no archived matches", () => {
    expect(metaEventBracket([], [])).toBeNull();
  });

  it("falls back when the phases name no single-elimination stage", () => {
    expect(metaEventBracket(TOP_8, [SWISS])?.title).toBe("Top 8");
  });
});

describe("metaEventBracket seats", () => {
  it("counts a bye toward its round, so the derived halving still reads", () => {
    const bracket = metaEventBracket(
      [
        match({ roundNumber: 1, tableNumber: 1, player1Id: "a", player2Id: "b", winnerId: "a" }),
        match({
          roundNumber: 1,
          tableNumber: null,
          isBye: true,
          player1Id: "c",
          player2Id: null,
          winnerId: "c",
          gamesWonP2: null,
        }),
        match({ roundNumber: 2, tableNumber: 1, player1Id: "a", player2Id: "c", winnerId: "c" }),
      ],
      [],
    );

    expect(bracket?.rounds.map((entry) => entry.label)).toEqual(["Semifinals", "Final"]);
    expect(bracket?.rounds[0]!.matches[1]!.seats[1]).toEqual({
      playerId: null,
      isWinner: false,
      gamesWon: null,
    });
  });

  it("marks the winning seat on either side of a match", () => {
    const bracket = metaEventBracket(
      [
        ...round(1, 2),
        match({
          roundNumber: 2,
          player1Id: "a",
          player2Id: "b",
          winnerId: "b",
          gamesWonP1: 1,
          gamesWonP2: 2,
        }),
      ],
      [],
    );

    expect(bracket?.rounds[1]!.matches[0]!.seats).toEqual([
      { playerId: "a", isWinner: false, gamesWon: 1 },
      { playerId: "b", isWinner: true, gamesWon: 2 },
    ]);
  });

  it("marks neither seat when the source reported no winner", () => {
    const bracket = metaEventBracket(
      [
        ...round(1, 2),
        match({ roundNumber: 2, winnerId: null, gamesWonP1: null, gamesWonP2: null }),
      ],
      [],
    );
    expect(bracket?.rounds[1]!.matches[0]!.seats.every((seat) => !seat.isWinner)).toBe(true);
  });

  it("gives every match a key of its own", () => {
    const bracket = metaEventBracket(TOP_8, [phase()]);
    const keys = bracket?.rounds.flatMap((entry) => entry.matches.map((one) => one.key)) ?? [];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
