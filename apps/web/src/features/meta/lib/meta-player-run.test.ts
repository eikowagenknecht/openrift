import { describe, expect, it } from "vitest";

import { metaMatch, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

import {
  metaBestFinishPerLegend,
  metaCutLineRecord,
  metaCutRoundLabel,
  metaEventPlayerByKey,
  metaPlayerRounds,
  metaPlayerRun,
  metaRunRecord,
} from "./meta-player-run";

const SWISS = metaPhase({ phaseOrder: 1, name: "Phase 1", roundType: "SWISS", rankRequired: null });
const CUT = metaPhase();
const PHASES = [SWISS, CUT];

const swiss = (roundNumber: number, overrides = {}) =>
  metaMatch({ phaseOrder: 1, roundNumber, tableNumber: roundNumber * 10, ...overrides });

const ANA_RUN = [
  swiss(1, {
    player1Id: "p-1",
    player2Id: null,
    winnerId: null,
    isBye: true,
    gamesWonP1: null,
    gamesWonP2: null,
  }),
  swiss(2, { player1Id: "p-2", player2Id: "p-1", winnerId: "p-1", gamesWonP1: 0, gamesWonP2: 2 }),
  swiss(3, { player1Id: "p-1", player2Id: "p-3", winnerId: "p-3", gamesWonP1: 1, gamesWonP2: 2 }),
  swiss(4, {
    player1Id: "p-1",
    player2Id: "p-4",
    winnerId: null,
    isDraw: true,
    gamesWonP1: 1,
    gamesWonP2: 1,
  }),
  metaMatch({
    roundNumber: 1,
    player1Id: "p-8",
    player2Id: "p-1",
    winnerId: "p-1",
    gamesWonP1: 0,
    gamesWonP2: 2,
  }),
  metaMatch({ roundNumber: 2, player1Id: "p-1", player2Id: "p-4", winnerId: "p-1" }),
];

describe("metaPlayerRun", () => {
  it("reads one player's rounds from their side of each match, in play order", () => {
    const run = metaPlayerRun(ANA_RUN.toReversed(), PHASES, "p-1");

    expect(run.swiss.map((round) => round.outcome)).toEqual(["bye", "win", "loss", "draw"]);
    expect(run.swiss[1]).toMatchObject({
      roundNumber: 2,
      tableNumber: 20,
      gamesWon: 2,
      gamesLost: 0,
      opponentId: "p-2",
      isCut: false,
    });
    expect(run.swiss[0]!.opponentId).toBeNull();
  });

  it("splits the cut off by the phase the source filed it under", () => {
    const run = metaPlayerRun(ANA_RUN, PHASES, "p-1");

    expect(run.cut.map((round) => [round.roundNumber, round.outcome])).toEqual([
      [1, "win"],
      [2, "win"],
    ]);
    expect(run.cut.every((round) => round.isCut)).toBe(true);
  });

  it("treats every round as Swiss for an event with no phase list", () => {
    expect(metaPlayerRun(ANA_RUN, [], "p-1").cut).toEqual([]);
  });

  it("reports an unreported result as unknown rather than a loss", () => {
    const run = metaPlayerRun(
      [swiss(1, { player1Id: "p-1", player2Id: "p-2", winnerId: null })],
      PHASES,
      "p-1",
    );
    expect(run.swiss[0]!.outcome).toBe("unknown");
  });
});

describe("metaPlayerRounds", () => {
  it("files every player's rounds in one pass, both sides of a match", () => {
    const rounds = metaPlayerRounds(ANA_RUN, PHASES);

    expect(rounds.get("p-1")?.length).toBe(6);
    expect(rounds.get("p-2")?.map((round) => round.outcome)).toEqual(["loss"]);
    expect(rounds.get("p-4")?.map((round) => round.outcome)).toEqual(["draw", "loss"]);
    expect(rounds.has("p-9")).toBe(false);
  });
});

describe("metaRunRecord", () => {
  it("counts a bye as the win the standings credit", () => {
    expect(metaRunRecord(metaPlayerRun(ANA_RUN, PHASES, "p-1").swiss)).toEqual({
      wins: 2,
      losses: 1,
      draws: 1,
    });
  });
});

describe("metaCutRoundLabel", () => {
  it("names cut rounds from the last one played", () => {
    expect([1, 2, 3, 4].map((round) => metaCutRoundLabel(round, 4))).toEqual([
      "Top 16",
      "Quarterfinal",
      "Semifinal",
      "Final",
    ]);
  });
});

describe("metaEventPlayerByKey", () => {
  it("resolves a key to its row and prefers the better finish of a shared key", () => {
    const players = [
      metaPlayer({ id: "a", rank: 9, playerKey: "pnrenata" }),
      metaPlayer({ id: "b", rank: 2, playerKey: "pnrenata" }),
      metaPlayer({ id: "c", rank: 1, playerKey: null }),
    ];
    expect(metaEventPlayerByKey(players, "pnrenata")?.id).toBe("b");
    expect(metaEventPlayerByKey(players, "u404")).toBeNull();
  });
});

describe("metaBestFinishPerLegend", () => {
  const kennen = {
    cardId: "card-kennen",
    name: "Kennen, Heart of the Tempest",
    slug: "heart-of-the-tempest",
    imageId: null,
    domains: ["chaos", "order"],
    archiveSlug: "kennen-heart-of-the-tempest",
  };
  const azir = { ...kennen, cardId: "card-azir", name: "Azir, Emperor of the Sands" };

  it("keeps one row per legend, the best-placed pilot, best finish first", () => {
    const best = metaBestFinishPerLegend([
      metaPlayer({ id: "a", rank: 4, legend: kennen }),
      metaPlayer({ id: "b", rank: 2, legend: kennen }),
      metaPlayer({ id: "c", rank: 3, legend: azir }),
      metaPlayer({ id: "d", rank: 1, legend: null }),
    ]);
    expect(best.map((entry) => [entry.legend.name, entry.player.id])).toEqual([
      ["Kennen, Heart of the Tempest", "b"],
      ["Azir, Emperor of the Sands", "c"],
    ]);
  });

  it("orders a shared rank by legend name", () => {
    const best = metaBestFinishPerLegend([
      metaPlayer({ id: "a", rank: 1, legend: kennen }),
      metaPlayer({ id: "b", rank: 1, legend: azir }),
    ]);
    expect(best.map((entry) => entry.legend.name)).toEqual([
      "Azir, Emperor of the Sands",
      "Kennen, Heart of the Tempest",
    ]);
  });
});

describe("metaCutLineRecord", () => {
  const field = [
    metaPlayer({ id: "a", rank: 7, wins: 11, losses: 2, draws: 0 }),
    metaPlayer({ id: "b", rank: 8, wins: 11, losses: 2, draws: 1 }),
    metaPlayer({ id: "c", rank: 9, wins: 11, losses: 1, draws: 1 }),
  ];

  it("reads the record of the last standing that made the cut", () => {
    expect(metaCutLineRecord(field, 8)).toBe("11-2-1");
  });

  it("names nothing without a cut, with a bucketed rank, or without a record", () => {
    expect(metaCutLineRecord(field, null)).toBeNull();
    expect(metaCutLineRecord([metaPlayer({ rank: 8, rankIsTier: true })], 8)).toBeNull();
    expect(metaCutLineRecord([metaPlayer({ rank: 8, wins: null })], 8)).toBeNull();
    expect(metaCutLineRecord(field, 16)).toBeNull();
  });
});
