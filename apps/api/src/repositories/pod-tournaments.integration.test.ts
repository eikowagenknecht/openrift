import type { PodScoringScheme } from "@openrift/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import {
  finalizeRound,
  pairNextRound,
  rerollRound,
  submitPodResult,
} from "../services/pod-pairing.js";
import { createDbContext } from "../test/integration-context.js";

const OWNER_ID = "a0000000-0099-4000-a000-000000000001";
const ctx = createDbContext(OWNER_ID);

describe.skipIf(!ctx)("podTournamentsRepo (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const tournamentsRepo = repos.podTournaments;
  const scheme: PodScoringScheme = "standard";
  let counter = 0;

  beforeAll(async () => {
    await db
      .insertInto("users")
      .values({
        id: OWNER_ID,
        email: "pod-owner@test.com",
        name: "Pod Owner",
        emailVerified: true,
        image: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("podTournaments").where("ownerUserId", "=", OWNER_ID).execute();
    await db.deleteFrom("users").where("id", "=", OWNER_ID).execute();
  });

  async function freshTournament(playerCount: number) {
    counter += 1;
    const tournament = await tournamentsRepo.create({
      ownerUserId: OWNER_ID,
      name: `Tournament ${counter}`,
    });
    const players = [];
    for (let index = 0; index < playerCount; index++) {
      players.push(await tournamentsRepo.addPlayer(tournament.id, `Player ${index + 1}`));
    }
    return { tournament, players };
  }

  // Report every pod in the open round with placements 1..size in member order.
  async function reportOpenRound(tournamentId: string) {
    const rounds = await tournamentsRepo.loadRounds(tournamentId, scheme);
    const open = rounds.find((round) => round.status === "reporting");
    if (!open) {
      throw new Error("no open round");
    }
    for (const pod of open.pods) {
      await submitPodResult(
        repos,
        tournamentId,
        pod.id,
        pod.members.map((member, index) => ({ playerId: member.playerId, placement: index + 1 })),
        { allowFinalized: false },
      );
    }
    return open;
  }

  it("pairs, reports, and finalizes a round, deriving standings and opponents", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const open = await reportOpenRound(tournament.id);
    expect(open.pods).toHaveLength(2);
    expect(open.pods.every((pod) => pod.size === 4)).toBe(true);

    const beforeFinalize = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, beforeFinalize!, open.roundNumber);

    const after = await tournamentsRepo.findById(tournament.id);
    expect(after!.currentRound).toBe(1);
    expect(after!.status).toBe("running");

    const standings = await tournamentsRepo.computeStandings(tournament.id, scheme);
    expect(standings).toHaveLength(8);
    // Two 4-pods scored [3,2,1,0]: the field total is 12, everyone played one 4-pod.
    expect(standings.reduce((sum, row) => sum + row.score, 0)).toBe(12);
    expect(standings.every((row) => row.roundsPlayed === 1)).toBe(true);
    expect(standings.every((row) => row.pods4Count === 1 && row.pods3Count === 0)).toBe(true);

    // The pairing snapshot now carries opponent history: each player met 3 others once.
    const snapshot = await tournamentsRepo.loadPairingSnapshot(tournament.id, scheme);
    expect(snapshot).toHaveLength(8);
    for (const player of snapshot) {
      expect(player.opponents.size).toBe(3);
      expect([...player.opponents.values()].every((count) => count === 1)).toBe(true);
    }
  });

  it("rejects pairing while a round is open, and re-roll keeps the round number", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await expect(pairNextRound(repos, reloaded!)).rejects.toMatchObject({ status: 409 });

    const beforeReroll = await tournamentsRepo.loadRounds(tournament.id, scheme);
    const podIdsBefore = beforeReroll[0]!.pods.map((pod) => pod.id);
    await rerollRound(repos, reloaded!, 1);
    const afterReroll = await tournamentsRepo.loadRounds(tournament.id, scheme);
    expect(afterReroll).toHaveLength(1);
    expect(afterReroll[0]!.roundNumber).toBe(1);
    // Re-roll replaces the pods (fresh ids).
    expect(afterReroll[0]!.pods.map((pod) => pod.id)).not.toEqual(podIdsBefore);
  });

  it("blocks re-roll once a result is entered, and finalize on an unreported pod", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    const openRounds = await tournamentsRepo.loadRounds(tournament.id, scheme);
    const open = openRounds[0]!;

    await expect(finalizeRound(repos, reloaded!, 1)).rejects.toMatchObject({ status: 400 });

    const firstPod = open.pods[0]!;
    await submitPodResult(
      repos,
      tournament.id,
      firstPod.id,
      firstPod.members.map((member, index) => ({
        playerId: member.playerId,
        placement: index + 1,
      })),
      { allowFinalized: false },
    );
    await expect(rerollRound(repos, reloaded!, 1)).rejects.toMatchObject({ status: 400 });
  });

  it("re-derives standings when a finalized result is edited", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const open = await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const pod = open.pods[0]!;
    const first = pod.members[0]!.playerId;
    const second = pod.members[1]!.playerId;
    const before = await tournamentsRepo.computeStandings(tournament.id, scheme);
    const scoreOf = (rows: typeof before, id: string) =>
      rows.find((row) => row.playerId === id)!.score;
    expect(scoreOf(before, first)).toBe(3);
    expect(scoreOf(before, second)).toBe(2);

    // Swap 1st and 2nd in that pod (owner edit of a finalized round).
    await submitPodResult(
      repos,
      tournament.id,
      pod.id,
      [
        { playerId: first, placement: 2 },
        { playerId: second, placement: 1 },
        { playerId: pod.members[2]!.playerId, placement: 3 },
        { playerId: pod.members[3]!.playerId, placement: 4 },
      ],
      { allowFinalized: true },
    );

    const afterEdit = await tournamentsRepo.computeStandings(tournament.id, scheme);
    expect(scoreOf(afterEdit, first)).toBe(2);
    expect(scoreOf(afterEdit, second)).toBe(3);
  });

  it("keeps a dropped player in their paired round but excludes them from the next pairing", async () => {
    const { tournament, players } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const open = await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    // Drop one player after round 1.
    const dropped = players[0]!;
    await tournamentsRepo.dropPlayer(dropped.id, 1);

    const standings = await tournamentsRepo.computeStandings(tournament.id, scheme);
    expect(standings.find((row) => row.playerId === dropped.id)!.status).toBe("dropped");
    // 7 active players pair into 1x4 + 1x3 (the dropped player is not seated).
    const afterDrop = await tournamentsRepo.findById(tournament.id);
    const snapshot = await tournamentsRepo.loadPairingSnapshot(tournament.id, scheme);
    expect(snapshot.map((player) => player.id)).not.toContain(dropped.id);
    expect(snapshot).toHaveLength(7);
    await pairNextRound(repos, afterDrop!);
    const allRounds = await tournamentsRepo.loadRounds(tournament.id, scheme);
    const round2 = allRounds.find((round) => round.roundNumber === 2)!;
    const seated = round2.pods.flatMap((pod) => pod.members.map((member) => member.playerId));
    expect(seated).not.toContain(dropped.id);
    expect(seated).toHaveLength(7);
    expect(round2.pods.map((pod) => pod.size).toSorted()).toEqual([3, 4]);
  });

  it("starts a late joiner at zero with no history, paired only from the next round", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const open = await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const late = await tournamentsRepo.addPlayer(tournament.id, "Late Joiner");
    const standings = await tournamentsRepo.computeStandings(tournament.id, scheme);
    const lateRow = standings.find((row) => row.playerId === late.id)!;
    expect(lateRow.score).toBe(0);
    expect(lateRow.roundsPlayed).toBe(0);

    const snapshot = await tournamentsRepo.loadPairingSnapshot(tournament.id, scheme);
    const lateSnapshot = snapshot.find((player) => player.id === late.id)!;
    expect(lateSnapshot.opponents.size).toBe(0);
    // Round 1's pods do not include the late joiner.
    const reloadedRounds = await tournamentsRepo.loadRounds(tournament.id, scheme);
    const round1 = reloadedRounds[0]!;
    const round1Players = round1.pods.flatMap((pod) =>
      pod.members.map((member) => member.playerId),
    );
    expect(round1Players).not.toContain(late.id);
  });

  it("reactivates a dropped player back into the field", async () => {
    const { tournament, players } = await freshTournament(8);
    const target = players[0]!;
    await tournamentsRepo.dropPlayer(target.id, 0);
    const afterDrop = await tournamentsRepo.loadPairingSnapshot(tournament.id, scheme);
    expect(afterDrop.map((player) => player.id)).not.toContain(target.id);

    await tournamentsRepo.reactivatePlayer(target.id);
    const reactivated = await tournamentsRepo.findPlayer(target.id);
    expect(reactivated!.status).toBe("active");
    expect(reactivated!.droppedAfterRound).toBeNull();
    const afterReactivate = await tournamentsRepo.loadPairingSnapshot(tournament.id, scheme);
    expect(afterReactivate.map((player) => player.id)).toContain(target.id);
  });

  it("rejects an unrepresentable active-player count", async () => {
    const { tournament } = await freshTournament(5);
    await expect(pairNextRound(repos, tournament)).rejects.toMatchObject({ status: 400 });
  });

  it("cascades a tournament delete to players and rounds", async () => {
    const { tournament } = await freshTournament(6);
    await pairNextRound(repos, tournament);
    await tournamentsRepo.deleteById(tournament.id);
    expect(await tournamentsRepo.listPlayers(tournament.id)).toEqual([]);
    expect(await tournamentsRepo.findOpenRound(tournament.id)).toBeUndefined();
    expect(await tournamentsRepo.loadRounds(tournament.id, scheme)).toEqual([]);
  });
});
