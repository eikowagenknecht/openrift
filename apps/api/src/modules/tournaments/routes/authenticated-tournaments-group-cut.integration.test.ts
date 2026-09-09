import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const HOST_ID = crypto.randomUUID();
const LEGEND_SLUG = `group-cut-legend-${HOST_ID.slice(0, 8)}`;

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
    ranking: { playerId: string; seed: number | null; qualified: boolean }[];
    pendingMetaShares: { legendCardId: string; legendName: string | null }[];
    stageComplete: boolean;
    cutGenerated: boolean;
    seedsDiverged: boolean;
  } | null;
}

describe.skipIf(!hostCtx)("Group stage with a fixed top cut (integration)", () => {
  const host = hostCtx!;
  let legendCardId = "";

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
  });

  afterAll(async () => {
    await host.db.deleteFrom("tournaments").where("hostUserId", "=", HOST_ID).execute();
    await host.db.deleteFrom("cards").where("slug", "=", LEGEND_SLUG).execute();
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
});
