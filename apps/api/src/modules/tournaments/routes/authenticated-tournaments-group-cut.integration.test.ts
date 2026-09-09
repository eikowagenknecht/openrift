import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const HOST_ID = crypto.randomUUID();
const LEGEND_SLUG = `group-cut-legend-${HOST_ID.slice(0, 8)}`;
const EXTRA_LEGENDS = ["rare", "x", "y"] as const;

const hostCtx = createTestContext(HOST_ID, `test-${HOST_ID}@test.com`);

interface RunState {
  tournament: { id: string; status: string };
  players: { id: string; displayName: string }[];
  rounds: {
    roundNumber: number;
    status: string;
    pods: {
      id: string;
      podNumber: number;
      resultStatus: string;
      members: { playerId: string; displayName: string; gamePoints: number | null }[];
    }[];
  }[];
  groupStage: {
    groups: {
      id: string;
      label: string;
      pairedGroupId: string | null;
      playerIds: string[];
      roundsStarted: number;
      currentRoundReported: boolean;
      canStartNextRound: boolean;
      done: boolean;
      standings: { playerId: string; place: number; decidedBy: string | null }[];
    }[];
    ranking: {
      playerId: string;
      groupLabel: string;
      place: number;
      seed: number | null;
      qualified: boolean;
      decidedBy: string | null;
    }[];
    pendingMetaShares: { legendCardId: string; legendName: string | null }[];
    stageComplete: boolean;
    cutGenerated: boolean;
    seedsDiverged: boolean;
  } | null;
}

describe.skipIf(!hostCtx)("Group stage with a fixed top cut (integration)", () => {
  const host = hostCtx!;
  let legendCardId = "";
  const extraLegendIds = new Map<string, string>();

  async function createTournament(body: Record<string, unknown> = {}): Promise<string> {
    const res = await host.app.fetch(
      req("POST", "/tournaments", {
        name: "Summoner Skirmish",
        host: { type: "user" },
        pairingStyle: "swiss",
        format: "group_cut",
        deckSubmission: "none",
        startsAt: "2026-06-01T12:00:00Z",
        ...body,
      }),
    );
    expect(res.status).toBe(201);
    return ((await readJson(res)) as { id: string }).id;
  }

  async function addPlayers(tournamentId: string, count: number): Promise<void> {
    await host.db
      .insertInto("tournamentParticipants")
      .values(
        Array.from({ length: count }, (_, index) => ({
          tournamentId,
          displayName: `Player ${String(index + 1).padStart(2, "0")}`,
          status: "active" as const,
        })),
      )
      .execute();
  }

  async function run(tournamentId: string): Promise<RunState> {
    const res = await host.app.fetch(req("GET", `/tournaments/${tournamentId}/run`));
    expect(res.status).toBe(200);
    return (await readJson(res)) as RunState;
  }

  /** Reports every open pod of a round; `draw` gives both players the same score. */
  async function reportRound(
    tournamentId: string,
    roundNumber: number,
    options: { draw?: boolean } = {},
  ): Promise<void> {
    const state = await run(tournamentId);
    const round = state.rounds.find((entry) => entry.roundNumber === roundNumber);
    expect(round).toBeDefined();
    for (const pod of round?.pods ?? []) {
      if (pod.resultStatus === "reported") {
        continue;
      }
      const res = await host.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/pods/${pod.id}/result`, {
          results: pod.members.map((member, index) => ({
            playerId: member.playerId,
            gamePoints: options.draw ? 0 : index === 0 ? 1 : 0,
          })),
        }),
      );
      expect(res.status).toBe(200);
    }
  }

  /** Starts the next round for every unit; the paired 3-player groups start together. */
  async function startEveryGroup(tournamentId: string): Promise<void> {
    const state = await run(tournamentId);
    const started = new Set<string>();
    for (const group of state.groupStage?.groups ?? []) {
      if (started.has(group.id) || !group.canStartNextRound) {
        continue;
      }
      started.add(group.id);
      if (group.pairedGroupId) {
        started.add(group.pairedGroupId);
      }
      const res = await host.app.fetch(
        req("POST", `/tournaments/${tournamentId}/groups/${group.id}/rounds`),
      );
      expect(res.status).toBe(200);
    }
  }

  async function startGroup(tournamentId: string, groupId: string): Promise<void> {
    const res = await host.app.fetch(
      req("POST", `/tournaments/${tournamentId}/groups/${groupId}/rounds`),
    );
    expect(res.status).toBe(200);
  }

  /** Reports one group's round by slot: `[slotA, slotB, gamesA, gamesB]` per match. */
  async function reportBySlots(
    tournamentId: string,
    roundNumber: number,
    playerIds: string[],
    matches: [number, number, number, number][],
  ): Promise<void> {
    const state = await run(tournamentId);
    const round = state.rounds.find((entry) => entry.roundNumber === roundNumber);
    for (const [slotA, slotB, gamesA, gamesB] of matches) {
      const first = playerIds[slotA]!;
      const second = playerIds[slotB]!;
      const pod = round?.pods.find(
        (entry) =>
          entry.members.length === 2 &&
          entry.members.some((member) => member.playerId === first) &&
          entry.members.some((member) => member.playerId === second),
      );
      expect(pod).toBeDefined();
      const res = await host.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/pods/${pod?.id}/result`, {
          results: [
            { playerId: first, gamePoints: gamesA },
            { playerId: second, gamePoints: gamesB },
          ],
        }),
      );
      expect(res.status).toBe(200);
    }
  }

  async function playCut(tournamentId: string, rounds: number[]): Promise<void> {
    for (const roundNumber of rounds) {
      await reportRound(tournamentId, roundNumber);
      const finalized = await host.app.fetch(
        req("POST", `/tournaments/${tournamentId}/rounds/${roundNumber}/finalize`),
      );
      expect(finalized.status).toBe(200);
      if (roundNumber !== rounds.at(-1)) {
        const next = await host.app.fetch(req("POST", `/tournaments/${tournamentId}/rounds`, {}));
        expect(next.status).toBe(200);
      }
    }
  }

  beforeAll(async () => {
    await host.db
      .insertInto("users")
      .values({
        id: HOST_ID,
        email: `test-${HOST_ID}@test.com`,
        name: "Group Host",
        emailVerified: true,
        image: null,
      })
      .execute();
    const card = await host.db
      .insertInto("cards")
      .values({ slug: LEGEND_SLUG, name: "Jinx, Loose Cannon", type: "legend" })
      .returning("id")
      .executeTakeFirstOrThrow();
    legendCardId = card.id;
    for (const key of EXTRA_LEGENDS) {
      const extra = await host.db
        .insertInto("cards")
        .values({
          slug: `${LEGEND_SLUG}-${key}`,
          name: `Legend ${key.toUpperCase()}`,
          type: "legend",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      extraLegendIds.set(key, extra.id);
    }
  });

  afterAll(async () => {
    await host.db.deleteFrom("tournaments").where("hostUserId", "=", HOST_ID).execute();
    await host.db.deleteFrom("cards").where("slug", "like", `${LEGEND_SLUG}%`).execute();
    await host.db.deleteFrom("users").where("id", "=", HOST_ID).execute();
  });

  it("runs 18 players through the groups and the top 8 to a champion", async () => {
    const id = await createTournament({ name: "Skirmish 18", cutSize: 8 });
    await addPlayers(id, 18);

    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);

    const afterGroups = await run(id);
    const groups = afterGroups.groupStage?.groups ?? [];
    // 18 = three 4-player groups plus the two paired 3-player groups.
    expect(groups.map((group) => group.label)).toEqual(["A", "B", "C", "D", "E"]);
    expect(groups.filter((group) => group.playerIds.length === 4)).toHaveLength(3);
    const paired = groups.filter((group) => group.pairedGroupId !== null);
    expect(paired.map((group) => group.label)).toEqual(["D", "E"]);
    expect(paired[0]?.pairedGroupId).toBe(paired[1]?.id);
    expect(afterGroups.rounds.map((round) => round.roundNumber)).toEqual([1, 2, 3]);
    expect(afterGroups.rounds[0]?.pods).toHaveLength(9);
    expect(afterGroups.tournament.status).toBe("running");

    await reportRound(id, 1);

    // Group A alone walks to round 3 while everyone else waits on round 1.
    const groupA = groups[0]!;
    for (const roundNumber of [2, 3]) {
      const started = await host.app.fetch(
        req("POST", `/tournaments/${id}/groups/${groupA.id}/rounds`),
      );
      expect(started.status).toBe(200);
      await reportRound(id, roundNumber);
    }
    const midway = await run(id);
    expect(midway.groupStage?.groups[0]?.done).toBe(true);
    expect(midway.groupStage?.groups[1]?.roundsStarted).toBe(1);
    expect(midway.groupStage?.stageComplete).toBe(false);

    const early = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(early.status).toBe(409);
    expect(JSON.stringify(await readJson(early))).toContain("Still playing");

    for (const roundNumber of [2, 3]) {
      await startEveryGroup(id);
      await reportRound(id, roundNumber);
    }
    const stageDone = await run(id);
    expect(stageDone.groupStage?.stageComplete).toBe(true);

    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);

    const seeded = await host.db
      .selectFrom("tournamentParticipants")
      .select(["id", "seed"])
      .where("tournamentId", "=", id)
      .where("seed", "is not", null)
      .execute();
    expect(seeded.map((row) => row.seed).toSorted((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);

    const withCut = await run(id);
    expect(withCut.groupStage?.cutGenerated).toBe(true);
    expect(withCut.groupStage?.seedsDiverged).toBe(false);
    const quarterFinals = withCut.rounds.find((round) => round.roundNumber === 4);
    expect(quarterFinals?.pods).toHaveLength(4);
    const seedOf = new Map(seeded.map((row) => [row.id, row.seed]));
    // Conventional bracket: 1v8, 4v5, 2v7, 3v6.
    expect(
      quarterFinals?.pods.map((pod) => pod.members.map((member) => seedOf.get(member.playerId))),
    ).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    // Rounds 1 to 3 are finalized by the cut, never one at a time.
    expect(
      withCut.rounds
        .filter((round) => round.roundNumber <= 3)
        .every((round) => round.status === "finalized"),
    ).toBe(true);

    for (const roundNumber of [4, 5, 6]) {
      await reportRound(id, roundNumber);
      const finalized = await host.app.fetch(
        req("POST", `/tournaments/${id}/rounds/${roundNumber}/finalize`),
      );
      expect(finalized.status).toBe(200);
      if (roundNumber < 6) {
        const next = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
        expect(next.status).toBe(200);
      }
    }

    const finished = await run(id);
    expect(finished.rounds.find((round) => round.roundNumber === 6)?.pods).toHaveLength(1);
    expect(finished.tournament.status).toBe("completed");

    const afterFinal = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(afterFinal.status).toBe(409);
    expect(JSON.stringify(await readJson(afterFinal))).toContain("final");
  });

  it("refuses the groups by name while the Legend tiebreak misses a Legend", async () => {
    const id = await createTournament({ name: "Legend Check", legendTiebreak: true, cutSize: 4 });
    await addPlayers(id, 8);
    const players = await host.db
      .selectFrom("tournamentParticipants")
      .select(["id", "displayName"])
      .where("tournamentId", "=", id)
      .orderBy("displayName", "asc")
      .execute();
    const withoutLegend = players.at(-1)!;
    await host.db
      .updateTable("tournamentParticipants")
      .set({ legendCardId })
      .where("tournamentId", "=", id)
      .where("id", "!=", withoutLegend.id)
      .execute();

    const refused = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(refused.status).toBe(400);
    const body = JSON.stringify(await readJson(refused));
    expect(body).toContain("1 player has no Legend on file");
    expect(body).toContain(withoutLegend.displayName);

    await host.db
      .updateTable("tournamentParticipants")
      .set({ legendCardId })
      .where("id", "=", withoutLegend.id)
      .execute();
    const accepted = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(accepted.status).toBe(200);
  });

  it("blocks the cut on a tie that needs a meta share and takes it after the values arrive", async () => {
    const id = await createTournament({ name: "Meta Tie", legendTiebreak: true, cutSize: 8 });
    await addPlayers(id, 8);
    await host.db
      .updateTable("tournamentParticipants")
      .set({ legendCardId })
      .where("tournamentId", "=", id)
      .execute();

    const roundsRes = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(roundsRes.status).toBe(200);
    // Every match a draw: the tie walks past head-to-head, game win rate and
    // the Legend count down to the meta tier.
    for (const roundNumber of [1, 2, 3]) {
      if (roundNumber > 1) {
        await startEveryGroup(id);
      }
      await reportRound(id, roundNumber, { draw: true });
    }

    const pending = await run(id);
    expect(pending.groupStage?.pendingMetaShares).toEqual([
      { legendCardId, legendName: "Jinx, Loose Cannon" },
    ]);
    const refused = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(refused.status).toBe(409);
    expect(JSON.stringify(await readJson(refused))).toContain("meta shares");

    const shares = await host.app.fetch(
      req("PUT", `/tournaments/${id}/legend-meta-shares`, {
        shares: [{ legendCardId, share: 12.5 }],
      }),
    );
    expect(shares.status).toBe(200);
    const stored = (await readJson(shares)) as {
      legendMetaShares: { legendCardId: string; share: number }[];
      groupStage: { pendingMetaShares: unknown[] } | null;
    };
    expect(stored.legendMetaShares).toEqual([
      { legendCardId, legendName: "Jinx, Loose Cannon", share: 12.5 },
    ]);
    expect(stored.groupStage?.pendingMetaShares).toEqual([]);

    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);
    const seeds = await host.db
      .selectFrom("tournamentParticipants")
      .select("seed")
      .where("tournamentId", "=", id)
      .where("seed", "is not", null)
      .execute();
    expect(seeds).toHaveLength(8);
  });

  it("forfeits a dropped player's open group match as a walkover", async () => {
    const id = await createTournament({ name: "Walkover", cutSize: 4 });
    await addPlayers(id, 8);
    const roundsRes = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(roundsRes.status).toBe(200);

    const state = await run(id);
    const pod = state.rounds[0]!.pods[0]!;
    const [leaving, staying] = pod.members;
    const dropped = await host.app.fetch(
      req("POST", `/tournaments/${id}/participants/${leaving!.playerId}/drop`),
    );
    expect(dropped.status).toBe(200);

    const members = await host.db
      .selectFrom("podMembers")
      .select(["playerId", "placement", "gamePoints"])
      .where("podId", "=", pod.id)
      .execute();
    const resultStatus = await host.db
      .selectFrom("pods")
      .select("resultStatus")
      .where("id", "=", pod.id)
      .executeTakeFirstOrThrow();
    expect(resultStatus.resultStatus).toBe("reported");
    expect(members.every((member) => member.gamePoints === null)).toBe(true);
    expect(members.find((member) => member.playerId === staying!.playerId)?.placement).toBe(1);
    expect(members.find((member) => member.playerId === leaving!.playerId)?.placement).toBe(2);

    // The next round's pods for the dropped player are created reported too.
    await reportRound(id, 1);
    await startEveryGroup(id);
    const runResult2 = await run(id);
    const round2 = runResult2.rounds.find((round) => round.roundNumber === 2);
    const forfeited = round2?.pods.find((entry) =>
      entry.members.some((member) => member.playerId === leaving!.playerId),
    );
    expect(forfeited?.resultStatus).toBe("reported");
    expect(forfeited?.members.every((member) => member.gamePoints === null)).toBe(true);
  });

  it("runs 16 players with the groups at different speeds through to a champion", async () => {
    const id = await createTournament({ name: "Skirmish 16", cutSize: 8 });
    await addPlayers(id, 16);
    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);

    const afterGroups = await run(id);
    const groups = afterGroups.groupStage?.groups ?? [];
    expect(groups.map((group) => group.label)).toEqual(["A", "B", "C", "D"]);
    expect(groups.every((group) => group.playerIds.length === 4)).toBe(true);
    expect(groups.every((group) => group.pairedGroupId === null)).toBe(true);
    expect(afterGroups.rounds[0]?.pods).toHaveLength(8);

    await reportRound(id, 1);
    const groupA = groups[0]!;
    for (const roundNumber of [2, 3]) {
      await startGroup(id, groupA.id);
      await reportRound(id, roundNumber);
    }

    const midway = await run(id);
    expect(midway.groupStage?.groups[0]?.done).toBe(true);
    expect(midway.groupStage?.groups.slice(1).map((group) => group.roundsStarted)).toEqual([
      1, 1, 1,
    ]);
    const round2 = midway.rounds.find((entry) => entry.roundNumber === 2);
    const inGroupA = new Set(groupA.playerIds);
    expect(round2?.pods).toHaveLength(2);
    expect(
      round2?.pods.every((pod) => pod.members.every((member) => inGroupA.has(member.playerId))),
    ).toBe(true);
    const early = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(early.status).toBe(409);

    for (const roundNumber of [2, 3]) {
      await startEveryGroup(id);
      await reportRound(id, roundNumber);
    }
    const stageDone = await run(id);
    expect(stageDone.groupStage?.stageComplete).toBe(true);

    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);
    const withCut = await run(id);
    const qualified = (withCut.groupStage?.ranking ?? []).filter((row) => row.qualified);
    expect(qualified.map((row) => row.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(qualified.filter((row) => row.place === 1)).toHaveLength(4);
    expect(qualified.filter((row) => row.place === 2)).toHaveLength(4);
    expect(withCut.rounds.find((entry) => entry.roundNumber === 4)?.pods).toHaveLength(4);

    await playCut(id, [4, 5, 6]);
    const finished = await run(id);
    expect(finished.rounds.find((entry) => entry.roundNumber === 6)?.pods).toHaveLength(1);
    expect(finished.tournament.status).toBe("completed");
  });

  it("resolves a tiebreak-heavy 16-player field down to the exact seeds", async () => {
    const id = await createTournament({
      name: "Tiebreak Skirmish",
      cutSize: 8,
      legendTiebreak: true,
      matchFormat: "bo3",
    });
    await addPlayers(id, 16);
    await host.db
      .updateTable("tournamentParticipants")
      .set({ legendCardId })
      .where("tournamentId", "=", id)
      .execute();

    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);
    const afterGroups = await run(id);
    const groups = afterGroups.groupStage?.groups ?? [];
    const slots = new Map(groups.map((group) => [group.label, group.playerIds]));

    const rare = extraLegendIds.get("rare")!;
    const legendX = extraLegendIds.get("x")!;
    const legendY = extraLegendIds.get("y")!;
    const assignments: [string, string][] = [
      [slots.get("C")![0]!, rare],
      [slots.get("D")![0]!, legendX],
      [slots.get("A")![2]!, legendX],
      [slots.get("D")![1]!, legendY],
      [slots.get("A")![3]!, legendY],
    ];
    for (const [participantId, cardId] of assignments) {
      await host.db
        .updateTable("tournamentParticipants")
        .set({ legendCardId: cardId })
        .where("id", "=", participantId)
        .execute();
    }

    const scripts: Record<string, [number, number, number, number][][]> = {
      A: [
        [
          [0, 1, 2, 0],
          [2, 3, 2, 0],
        ],
        [
          [0, 2, 2, 0],
          [1, 3, 2, 0],
        ],
        [
          [0, 3, 0, 2],
          [1, 2, 2, 0],
        ],
      ],
      B: [
        [
          [0, 1, 2, 0],
          [2, 3, 2, 0],
        ],
        [
          [0, 2, 0, 2],
          [1, 3, 2, 0],
        ],
        [
          [0, 3, 2, 0],
          [1, 2, 2, 1],
        ],
      ],
      C: [
        [
          [0, 1, 1, 1],
          [2, 3, 2, 0],
        ],
        [
          [0, 2, 2, 0],
          [1, 3, 2, 0],
        ],
        [
          [0, 3, 2, 0],
          [1, 2, 2, 0],
        ],
      ],
      D: [
        [
          [0, 1, 1, 1],
          [2, 3, 2, 0],
        ],
        [
          [0, 2, 2, 0],
          [1, 3, 2, 0],
        ],
        [
          [0, 3, 2, 0],
          [1, 2, 2, 0],
        ],
      ],
    };

    for (const roundNumber of [1, 2, 3]) {
      if (roundNumber > 1) {
        await startEveryGroup(id);
      }
      for (const [label, rounds] of Object.entries(scripts)) {
        await reportBySlots(id, roundNumber, slots.get(label)!, rounds[roundNumber - 1]!);
      }
    }

    const pending = await run(id);
    expect(
      (pending.groupStage?.pendingMetaShares ?? []).map((entry) => entry.legendCardId).toSorted(),
    ).toEqual([legendCardId, legendX, legendY].toSorted());
    const refused = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(refused.status).toBe(409);

    const shares = await host.app.fetch(
      req("PUT", `/tournaments/${id}/legend-meta-shares`, {
        shares: [
          { legendCardId, share: 30 },
          { legendCardId: rare, share: 1 },
          { legendCardId: legendX, share: 5 },
          { legendCardId: legendY, share: 20 },
        ],
      }),
    );
    expect(shares.status).toBe(200);

    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);
    const withCut = await run(id);
    const groupOf = (label: string) =>
      withCut.groupStage?.groups.find((group) => group.label === label);
    const [a, b, c, d] = ["A", "B", "C", "D"].map((label) => slots.get(label)!);

    expect(groupOf("A")?.standings.map((row) => row.playerId)).toEqual([
      a![0],
      a![1],
      a![2],
      a![3],
    ]);
    expect(groupOf("A")?.standings.map((row) => row.decidedBy)).toEqual([null, "h2h", null, "h2h"]);
    expect(groupOf("B")?.standings.map((row) => row.playerId)).toEqual([
      b![2],
      b![0],
      b![1],
      b![3],
    ]);
    expect(groupOf("B")?.standings.map((row) => row.decidedBy)).toEqual([
      null,
      "mini_table",
      "mini_table",
      null,
    ]);
    expect(
      groupOf("C")
        ?.standings.slice(0, 2)
        .map((row) => row.playerId),
    ).toEqual([c![0], c![1]]);
    expect(groupOf("C")?.standings[1]?.decidedBy).toBe("legend_count");
    expect(
      groupOf("D")
        ?.standings.slice(0, 2)
        .map((row) => row.playerId),
    ).toEqual([d![0], d![1]]);
    expect(groupOf("D")?.standings[1]?.decidedBy).toBe("meta_share");

    const ranking = withCut.groupStage?.ranking ?? [];
    const seedOf = (playerId: string): number | null =>
      ranking.find((row) => row.playerId === playerId)?.seed ?? null;
    expect(seedOf(c![0]!)).toBe(1);
    expect(seedOf(d![0]!)).toBe(2);
    expect(seedOf(b![2]!)).toBe(3);
    expect(seedOf(a![0]!)).toBe(4);
    expect(seedOf(d![1]!)).toBe(5);
    expect(seedOf(c![1]!)).toBe(6);
    // The last two runners-up are equal down to the final key, so only the pair is fixed.
    expect([seedOf(a![1]!), seedOf(b![0]!)].toSorted()).toEqual([7, 8]);
    expect(ranking.slice(0, 8).map((row) => row.decidedBy)).toEqual([
      null,
      "legend_count",
      "mw",
      "gw",
      null,
      "legend_count",
      "mw",
      "draw",
    ]);

    const seededRows = await host.db
      .selectFrom("tournamentParticipants")
      .select(["id", "seed"])
      .where("tournamentId", "=", id)
      .where("seed", "is not", null)
      .execute();
    const seedById = new Map(seededRows.map((row) => [row.id, row.seed]));
    expect(
      withCut.rounds
        .find((entry) => entry.roundNumber === 4)
        ?.pods.map((pod) => pod.members.map((member) => seedById.get(member.playerId))),
    ).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it("re-reads groups, progress, seeds and bracket unchanged after the cut", async () => {
    const id = await createTournament({ name: "Persistence", cutSize: 8 });
    await addPlayers(id, 18);
    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);

    await reportRound(id, 1);
    const afterGroups = await run(id);
    const groups = afterGroups.groupStage?.groups ?? [];
    const fast = groups[0]!;
    for (const roundNumber of [2, 3]) {
      await startGroup(id, fast.id);
      await reportRound(id, roundNumber);
    }
    for (const roundNumber of [2, 3]) {
      await startEveryGroup(id);
      await reportRound(id, roundNumber);
    }
    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);

    const first = await run(id);
    const second = await run(id);
    expect(second.groupStage).toEqual(first.groupStage);
    expect(second.rounds).toEqual(first.rounds);

    const stored = await host.db
      .selectFrom("tournamentParticipants")
      .select(["id", "groupId", "groupSlot", "seed"])
      .where("tournamentId", "=", id)
      .orderBy("id", "asc")
      .execute();
    expect(stored.filter((row) => row.groupId !== null)).toHaveLength(18);
    expect(stored.filter((row) => row.seed !== null)).toHaveLength(8);
    const paired = await host.db
      .selectFrom("tournamentGroups")
      .select(["id", "label", "pairedGroupId"])
      .where("tournamentId", "=", id)
      .orderBy("label", "asc")
      .execute();
    expect(paired.filter((row) => row.pairedGroupId !== null).map((row) => row.label)).toEqual([
      "D",
      "E",
    ]);

    const third = await run(id);
    expect(third.groupStage?.groups.map((group) => group.playerIds)).toEqual(
      first.groupStage?.groups.map((group) => group.playerIds),
    );
    expect(third.groupStage?.ranking).toEqual(first.groupStage?.ranking);
  });

  it("creates one set of pods and one cut round under concurrent calls", async () => {
    const id = await createTournament({ name: "Concurrency", cutSize: 8 });
    await addPlayers(id, 16);
    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);
    await reportRound(id, 1);

    const started = await run(id);
    const groups = started.groupStage?.groups ?? [];
    const first = groups[0]!;
    await Promise.all([
      host.app.fetch(req("POST", `/tournaments/${id}/groups/${first.id}/rounds`)),
      host.app.fetch(req("POST", `/tournaments/${id}/groups/${first.id}/rounds`)),
    ]);
    const afterRace = await run(id);
    const inFirst = new Set(first.playerIds);
    const round2 = afterRace.rounds.find((entry) => entry.roundNumber === 2);
    expect(
      round2?.pods.filter((pod) => pod.members.every((member) => inFirst.has(member.playerId))),
    ).toHaveLength(2);
    expect(afterRace.groupStage?.groups[0]?.roundsStarted).toBe(2);

    await reportRound(id, 2);
    for (const roundNumber of [2, 3]) {
      await startEveryGroup(id);
      await reportRound(id, roundNumber);
    }

    await Promise.all([
      host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {})),
      host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {})),
    ]);
    const rounds = await host.db
      .selectFrom("podRounds")
      .select("id")
      .where("tournamentId", "=", id)
      .where("roundNumber", "=", 4)
      .execute();
    expect(rounds).toHaveLength(1);
    const afterCut = await run(id);
    expect(afterCut.rounds.find((entry) => entry.roundNumber === 4)?.pods).toHaveLength(4);
    const seeds = await host.db
      .selectFrom("tournamentParticipants")
      .select("seed")
      .where("tournamentId", "=", id)
      .where("seed", "is not", null)
      .execute();
    expect(seeds).toHaveLength(8);
  });

  it("keeps the Legend tiebreak off once the rounds exist", async () => {
    const id = await createTournament({ name: "Frozen Legend", cutSize: 4 });
    await addPlayers(id, 8);
    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);
    await host.db
      .updateTable("tournamentParticipants")
      .set({ legendCardId })
      .where("tournamentId", "=", id)
      .execute();

    const refused = await host.app.fetch(
      req("PATCH", `/tournaments/${id}`, { legendTiebreak: true }),
    );
    expect(refused.status).toBe(409);

    for (const roundNumber of [1, 2, 3]) {
      if (roundNumber > 1) {
        await startEveryGroup(id);
      }
      await reportRound(id, roundNumber, { draw: true });
    }
    const state = await run(id);
    expect(state.groupStage?.pendingMetaShares).toEqual([]);
    const tiers = (state.groupStage?.groups ?? []).flatMap((group) =>
      group.standings.map((row) => row.decidedBy),
    );
    expect(tiers).not.toContain("legend_count");
    expect(tiers).not.toContain("meta_share");
    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);
  });

  it("clears the seeds and leaves no orphan pods when the cut is re-rolled", async () => {
    const id = await createTournament({ name: "Reroll Cut", cutSize: 4 });
    await addPlayers(id, 8);
    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);
    for (const roundNumber of [1, 2, 3]) {
      if (roundNumber > 1) {
        await startEveryGroup(id);
      }
      await reportRound(id, roundNumber);
    }
    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);

    const rerolled = await host.app.fetch(req("POST", `/tournaments/${id}/rounds/4/reroll`));
    expect(rerolled.status).toBe(200);

    const rounds = await host.db
      .selectFrom("podRounds")
      .select(["id", "roundNumber"])
      .where("tournamentId", "=", id)
      .execute();
    expect(rounds.map((row) => row.roundNumber).toSorted()).toEqual([1, 2, 3]);
    const orphanPods = await host.db
      .selectFrom("pods as p")
      .leftJoin("podRounds as r", "r.id", "p.roundId")
      .select("p.id as podId")
      .where("r.id", "is", null)
      .execute();
    expect(orphanPods).toHaveLength(0);
    const seeds = await host.db
      .selectFrom("tournamentParticipants")
      .select("seed")
      .where("tournamentId", "=", id)
      .where("seed", "is not", null)
      .execute();
    expect(seeds).toHaveLength(0);

    const again = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(again.status).toBe(200);
    const reseeded = await host.db
      .selectFrom("tournamentParticipants")
      .select("seed")
      .where("tournamentId", "=", id)
      .where("seed", "is not", null)
      .execute();
    expect(reseeded).toHaveLength(4);
  });

  it("keeps a player who dropped before the groups out of the plan", async () => {
    const id = await createTournament({ name: "Early Drop", cutSize: 4 });
    await addPlayers(id, 9);
    const players = await host.db
      .selectFrom("tournamentParticipants")
      .select(["id", "displayName"])
      .where("tournamentId", "=", id)
      .orderBy("displayName", "asc")
      .execute();
    const leaving = players.at(-1)!;
    const dropped = await host.app.fetch(
      req("POST", `/tournaments/${id}/participants/${leaving.id}/drop`),
    );
    expect(dropped.status).toBe(200);

    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);
    const state = await run(id);
    const assigned = (state.groupStage?.groups ?? []).flatMap((group) => group.playerIds);
    expect(assigned).toHaveLength(8);
    expect(assigned).not.toContain(leaving.id);
    const stored = await host.db
      .selectFrom("tournamentParticipants")
      .select("groupId")
      .where("id", "=", leaving.id)
      .executeTakeFirstOrThrow();
    expect(stored.groupId).toBeNull();
  });

  it("keeps a player who dropped during the stage out of the qualifiers", async () => {
    const id = await createTournament({ name: "Late Drop", cutSize: 4 });
    await addPlayers(id, 8);
    const generated = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(generated.status).toBe(200);
    await reportRound(id, 1);
    await startEveryGroup(id);
    await reportRound(id, 2);

    const midway = await run(id);
    const leader = (midway.groupStage?.groups[0]?.standings ?? [])[0]!;
    const dropped = await host.app.fetch(
      req("POST", `/tournaments/${id}/participants/${leader.playerId}/drop`),
    );
    expect(dropped.status).toBe(200);

    await startEveryGroup(id);
    await reportRound(id, 3);
    const stageDone = await run(id);
    const droppedRow = stageDone.groupStage?.ranking.find(
      (row) => row.playerId === leader.playerId,
    );
    expect(droppedRow?.qualified).toBe(false);

    const cut = await host.app.fetch(req("POST", `/tournaments/${id}/rounds`, {}));
    expect(cut.status).toBe(200);
    const seeded = await host.db
      .selectFrom("tournamentParticipants")
      .select(["id", "seed"])
      .where("tournamentId", "=", id)
      .where("seed", "is not", null)
      .execute();
    expect(seeded).toHaveLength(4);
    expect(seeded.map((row) => row.id)).not.toContain(leader.playerId);
  });
});
