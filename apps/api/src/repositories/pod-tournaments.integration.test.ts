import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { toRoundResponse } from "../lib/pod-tournament-presenters.js";
import type { PodScoring } from "../repositories/pod-tournaments.js";
import { scoringOf } from "../repositories/pod-tournaments.js";
import {
  finalizeRound,
  pairNextRound,
  replaceRoundPairing,
  rerollRound,
  submitPodPlayerResult,
  submitPodResult,
} from "../services/pod-pairing.js";
import { createDbContext } from "../test/integration-context.js";

const OWNER_ID = crypto.randomUUID();
const ctx = createDbContext(OWNER_ID);

describe.skipIf(!ctx)("podTournamentsRepo (integration)", () => {
  const { db } = ctx!;
  const repos = createRepos(db);
  const podRepo = repos.podTournaments;
  const tournamentsRepo = repos.tournaments;
  // The defaults a freshly created tournament carries; the derived reads take
  // the scoring knobs explicitly, so pass the same values the repo would store.
  const scoring: PodScoring = {
    scheme: "standard",
    byePoints: 3,
    winPoints: 3,
    drawPoints: 1,
    playMode: "1v1",
  };
  let counter = 0;

  async function loadRounds(tournamentId: string, roundScoring: PodScoring) {
    const rows = await podRepo.loadRounds(tournamentId);
    return rows.map((row) => toRoundResponse(row, roundScoring));
  }

  beforeAll(async () => {
    await db
      .insertInto("users")
      .values({
        id: OWNER_ID,
        email: `test-${OWNER_ID}@test.com`,
        name: "Pod Owner",
        emailVerified: true,
        image: null,
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("tournaments").where("hostUserId", "=", OWNER_ID).execute();
    await db.deleteFrom("users").where("id", "=", OWNER_ID).execute();
  });

  async function freshTournament(playerCount: number) {
    counter += 1;
    const tournament = await tournamentsRepo.create({
      hostType: "user",
      hostUserId: OWNER_ID,
      name: `Tournament ${counter}`,
      pairingStyle: "pod",
      deckSubmission: "none",
    });
    const players = [];
    for (let index = 0; index < playerCount; index++) {
      players.push(await podRepo.addPlayer(tournament.id, `Player ${index + 1}`));
    }
    return { tournament, players };
  }

  // Report every pod in the open round with strictly descending game points in
  // member order, so the derived placements come out 1..size (member 0 wins).
  async function reportOpenRound(tournamentId: string) {
    const rounds = await loadRounds(tournamentId, scoring);
    const open = rounds.find((round) => round.status === "reporting");
    if (!open) {
      throw new Error("no open round");
    }
    for (const pod of open.pods) {
      await submitPodResult(
        repos,
        tournamentId,
        pod.id,
        pod.members.map((member, index) => ({
          playerId: member.playerId,
          gamePoints: pod.members.length - index,
        })),
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

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    expect(standings).toHaveLength(8);
    // Two 4-pods scored [3,2,1,0]: the field total is 12, everyone played one 4-pod.
    expect(standings.reduce((sum, row) => sum + row.score, 0)).toBe(12);
    expect(standings.every((row) => row.roundsPlayed === 1)).toBe(true);
    expect(standings.every((row) => row.pods4Count === 1 && row.pods3Count === 0)).toBe(true);

    // The pairing snapshot now carries opponent history: each player met 3 others once.
    const snapshot = await podRepo.loadPairingSnapshot(tournament.id, scoring);
    expect(snapshot).toHaveLength(8);
    for (const player of snapshot) {
      expect(player.opponents.size).toBe(3);
      expect([...player.opponents.values()].every((count) => count === 1)).toBe(true);
    }
  });

  it("completes a pod from per-player score submissions", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const rounds = await loadRounds(tournament.id, scoring);
    const pod = rounds[0]!.pods[0]!;
    const podAfter = async () => {
      const reloaded = await loadRounds(tournament.id, scoring);
      return reloaded[0]!.pods.find((candidate) => candidate.id === pod.id)!;
    };
    const memberOf = (state: Awaited<ReturnType<typeof podAfter>>, playerId: string) =>
      state.members.find((member) => member.playerId === playerId)!;

    // Three of four players report their own scores: the pod stays pending, the
    // entered points are visible, and no placements are derived yet.
    for (const [index, member] of pod.members.slice(0, 3).entries()) {
      await submitPodPlayerResult(repos, tournament.id, pod.id, member.playerId, 4 - index);
    }
    let state = await podAfter();
    expect(state.resultStatus).toBe("pending");
    expect(state.members.filter((member) => member.gamePoints !== null)).toHaveLength(3);
    expect(state.members.every((member) => member.placement === null)).toBe(true);

    // The last score completes the pod: placements derive and the status flips.
    await submitPodPlayerResult(repos, tournament.id, pod.id, pod.members[3]!.playerId, 1);
    state = await podAfter();
    expect(state.resultStatus).toBe("reported");
    expect(memberOf(state, pod.members[0]!.playerId).placement).toBe(1);
    expect(memberOf(state, pod.members[3]!.playerId).placement).toBe(4);

    // A player correcting their own score re-derives the placements.
    await submitPodPlayerResult(repos, tournament.id, pod.id, pod.members[3]!.playerId, 9);
    state = await podAfter();
    expect(state.resultStatus).toBe("reported");
    expect(memberOf(state, pod.members[3]!.playerId).placement).toBe(1);
    expect(memberOf(state, pod.members[0]!.playerId).placement).toBe(2);
  });

  it("rejects a per-player score for an outsider or a finalized round", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const rounds = await loadRounds(tournament.id, scoring);
    const open = rounds[0]!;
    const pod = open.pods[0]!;
    const outsider = open.pods[1]!.members[0]!.playerId;

    await expect(
      submitPodPlayerResult(repos, tournament.id, pod.id, outsider, 5),
    ).rejects.toMatchObject({ status: 400 });

    await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);
    await expect(
      submitPodPlayerResult(repos, tournament.id, pod.id, pod.members[0]!.playerId, 5),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("batches winners across tournaments, matching the per-tournament standings", async () => {
    const { tournament: first } = await freshTournament(8);
    await pairNextRound(repos, first);
    const firstOpen = await reportOpenRound(first.id);
    await finalizeRound(repos, (await tournamentsRepo.findById(first.id))!, firstOpen.roundNumber);

    const { tournament: second } = await freshTournament(4);
    await pairNextRound(repos, second);
    const secondOpen = await reportOpenRound(second.id);
    await finalizeRound(
      repos,
      (await tournamentsRepo.findById(second.id))!,
      secondOpen.roundNumber,
    );

    // A tournament with no finalized rounds has no winner.
    const { tournament: unplayed } = await freshTournament(4);

    const winners = await podRepo.winnersAcross(
      [first, second, unplayed].map((tournament) => ({ id: tournament.id, scoring })),
    );

    const firstStandings = await podRepo.computeStandings(first.id, scoring);
    const secondStandings = await podRepo.computeStandings(second.id, scoring);
    expect(winners.get(first.id)).toEqual({
      participantId: firstStandings[0]!.playerId,
      displayName: firstStandings[0]!.displayName,
    });
    expect(winners.get(second.id)).toEqual({
      participantId: secondStandings[0]!.playerId,
      displayName: secondStandings[0]!.displayName,
    });
    expect(winners.has(unplayed.id)).toBe(false);

    expect(await podRepo.winnersAcross([])).toEqual(new Map());
  });

  it("rejects pairing while a round is open, and re-roll keeps the round number", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await expect(pairNextRound(repos, reloaded!)).rejects.toMatchObject({ status: 409 });

    const beforeReroll = await loadRounds(tournament.id, scoring);
    const podIdsBefore = beforeReroll[0]!.pods.map((pod) => pod.id);
    await rerollRound(repos, reloaded!, 1);
    const afterReroll = await loadRounds(tournament.id, scoring);
    expect(afterReroll).toHaveLength(1);
    expect(afterReroll[0]!.roundNumber).toBe(1);
    // Re-roll replaces the pods (fresh ids).
    expect(afterReroll[0]!.pods.map((pod) => pod.id)).not.toEqual(podIdsBefore);
  });

  it("blocks re-roll once a result is entered, and finalize on an unreported pod", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    const openRounds = await loadRounds(tournament.id, scoring);
    const open = openRounds[0]!;

    await expect(finalizeRound(repos, reloaded!, 1)).rejects.toMatchObject({ status: 400 });

    const firstPod = open.pods[0]!;
    await submitPodResult(
      repos,
      tournament.id,
      firstPod.id,
      firstPod.members.map((member, index) => ({
        playerId: member.playerId,
        gamePoints: firstPod.members.length - index,
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
    const before = await podRepo.computeStandings(tournament.id, scoring);
    const scoreOf = (rows: typeof before, id: string) =>
      rows.find((row) => row.playerId === id)!.score;
    expect(scoreOf(before, first)).toBe(3);
    expect(scoreOf(before, second)).toBe(2);

    // Swap 1st and 2nd in that pod (owner edit of a finalized round): now `second`
    // has the most game points, so the derived placements flip.
    await submitPodResult(
      repos,
      tournament.id,
      pod.id,
      [
        { playerId: first, gamePoints: 3 },
        { playerId: second, gamePoints: 4 },
        { playerId: pod.members[2]!.playerId, gamePoints: 2 },
        { playerId: pod.members[3]!.playerId, gamePoints: 1 },
      ],
      { allowFinalized: true },
    );

    const afterEdit = await podRepo.computeStandings(tournament.id, scoring);
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
    await podRepo.dropPlayer(dropped.id, 1);

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    expect(standings.find((row) => row.playerId === dropped.id)!.status).toBe("dropped");
    // 7 active players pair into 1x4 + 1x3 (the dropped player is not seated).
    const afterDrop = await tournamentsRepo.findById(tournament.id);
    const snapshot = await podRepo.loadPairingSnapshot(tournament.id, scoring);
    expect(snapshot.map((player) => player.id)).not.toContain(dropped.id);
    expect(snapshot).toHaveLength(7);
    await pairNextRound(repos, afterDrop!);
    const allRounds = await loadRounds(tournament.id, scoring);
    const round2 = allRounds.find((round) => round.roundNumber === 2)!;
    const seated = round2.pods.flatMap((pod) => pod.members.map((member) => member.playerId));
    expect(seated).not.toContain(dropped.id);
    expect(seated).toHaveLength(7);
    expect(round2.pods.map((pod) => pod.size).toSorted()).toEqual([3, 4]);
  });

  it("excludes non-roster participants (requested/invited/no_show) from the run surface", async () => {
    // Regression: a self-registration through the open
    // submission link creates a `requested` participant, and the run surface
    // (players, standings, winners) must not serve it — the pod response
    // schemas only accept the active/dropped roster, so a leaked row 500s
    // `runState` on output validation.
    const { tournament, players } = await freshTournament(4);
    await repos.tournaments.createParticipant({
      tournamentId: tournament.id,
      displayName: "Approval Queue",
      status: "requested",
    });
    await repos.tournaments.createParticipant({
      tournamentId: tournament.id,
      displayName: "Invited Only",
      status: "invited",
    });
    const dropped = players[0]!;
    await podRepo.dropPlayer(dropped.id, 0);

    const listed = await podRepo.listPlayers(tournament.id);
    expect(listed).toHaveLength(4);
    expect(listed.map((player) => player.status).toSorted()).toEqual([
      "active",
      "active",
      "active",
      "dropped",
    ]);

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    expect(standings).toHaveLength(4);
    for (const row of standings) {
      expect(["active", "dropped"]).toContain(row.status);
    }
    expect(standings.map((row) => row.displayName)).not.toContain("Approval Queue");
    expect(standings.map((row) => row.displayName)).not.toContain("Invited Only");
  });

  it("starts a late joiner at zero with no history, paired only from the next round", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const open = await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const late = await podRepo.addPlayer(tournament.id, "Late Joiner");
    const standings = await podRepo.computeStandings(tournament.id, scoring);
    const lateRow = standings.find((row) => row.playerId === late.id)!;
    expect(lateRow.score).toBe(0);
    expect(lateRow.roundsPlayed).toBe(0);

    const snapshot = await podRepo.loadPairingSnapshot(tournament.id, scoring);
    const lateSnapshot = snapshot.find((player) => player.id === late.id)!;
    expect(lateSnapshot.opponents.size).toBe(0);
    // Round 1's pods do not include the late joiner.
    const reloadedRounds = await loadRounds(tournament.id, scoring);
    const round1 = reloadedRounds[0]!;
    const round1Players = round1.pods.flatMap((pod) =>
      pod.members.map((member) => member.playerId),
    );
    expect(round1Players).not.toContain(late.id);
  });

  it("reactivates a dropped player back into the field", async () => {
    const { tournament, players } = await freshTournament(8);
    const target = players[0]!;
    await podRepo.dropPlayer(target.id, 0);
    const afterDrop = await podRepo.loadPairingSnapshot(tournament.id, scoring);
    expect(afterDrop.map((player) => player.id)).not.toContain(target.id);

    await podRepo.reactivatePlayer(target.id);
    const reactivated = await podRepo.findPlayer(target.id);
    expect(reactivated!.status).toBe("active");
    expect(reactivated!.droppedAfterRound).toBeNull();
    const afterReactivate = await podRepo.loadPairingSnapshot(tournament.id, scoring);
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
    expect(await podRepo.listPlayers(tournament.id)).toEqual([]);
    expect(await podRepo.findOpenRound(tournament.id)).toBeUndefined();
    expect(await loadRounds(tournament.id, scoring)).toEqual([]);
  });

  it("resolves a 5-player field with a manual bye that folds into standings", async () => {
    const { tournament, players } = await freshTournament(5);
    const sittingOut = players[4]!;
    await pairNextRound(repos, tournament, [sittingOut.id]);

    const rounds = await loadRounds(tournament.id, scoring);
    const open = rounds[0]!;
    expect(open.pods).toHaveLength(1);
    expect(open.pods[0]!.size).toBe(4);
    expect(open.byes.map((bye) => bye.playerId)).toEqual([sittingOut.id]);

    await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    const byeRow = standings.find((row) => row.playerId === sittingOut.id)!;
    expect(byeRow.score).toBe(3); // the tournament's bye points (default 3)
    expect(byeRow.byeCount).toBe(1);
    expect(byeRow.roundsPlayed).toBe(1);
    expect(byeRow.pods3Count).toBe(0);
    expect(byeRow.pods4Count).toBe(0);
    expect(byeRow.gamePoints).toBe(0); // a bye plays no game, so no game points
    // The bye player has no opponent history.
    const snapshot = await podRepo.loadPairingSnapshot(tournament.id, scoring);
    expect(snapshot.find((player) => player.id === sittingOut.id)!.opponents.size).toBe(0);
    expect(snapshot.find((player) => player.id === sittingOut.id)!.byes).toBe(1);
  });

  it("scores a bye by the tournament's configured bye points (0 when sat out)", async () => {
    const { tournament, players } = await freshTournament(5);
    await tournamentsRepo.updateSettings(tournament.id, { byePoints: 0 });
    const withZero = await tournamentsRepo.findById(tournament.id);
    expect(withZero!.byePoints).toBe(0);

    const sittingOut = players[4]!;
    await pairNextRound(repos, withZero!, [sittingOut.id]);
    const rounds = await loadRounds(tournament.id, scoring);
    const open = rounds[0]!;
    await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const standings = await podRepo.computeStandings(tournament.id, {
      ...scoring,
      byePoints: 0,
    });
    const byeRow = standings.find((row) => row.playerId === sittingOut.id)!;
    expect(byeRow.score).toBe(0); // sat out earns nothing
    expect(byeRow.byeCount).toBe(1);
    expect(byeRow.roundsPlayed).toBe(1);
  });

  it("breaks a score tie by total game points, then average opponent game points", async () => {
    // Two 4-pods. We hand-report game points so two players tie on tournament
    // score (both placed 2nd in their pod -> 2 pts) but differ on raw game points.
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const rounds = await loadRounds(tournament.id, scoring);
    const open = rounds[0]!;
    const runnersUp: string[] = [];
    for (const pod of open.pods) {
      // Member order finishes 1st..4th, but the runner-up's game points differ by pod.
      const runnerUpPoints = runnersUp.length === 0 ? 7 : 6;
      runnersUp.push(pod.members[1]!.playerId);
      await submitPodResult(
        repos,
        tournament.id,
        pod.id,
        [
          { playerId: pod.members[0]!.playerId, gamePoints: 8 },
          { playerId: pod.members[1]!.playerId, gamePoints: runnerUpPoints },
          { playerId: pod.members[2]!.playerId, gamePoints: 3 },
          { playerId: pod.members[3]!.playerId, gamePoints: 2 },
        ],
        { allowFinalized: false },
      );
    }
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    const [firstRunnerUp, secondRunnerUp] = runnersUp;
    const rowOf = (id: string) => standings.find((row) => row.playerId === id)!;
    // Both runners-up scored 2 tournament points, but the 7-game-point one ranks higher.
    expect(rowOf(firstRunnerUp!).score).toBe(2);
    expect(rowOf(secondRunnerUp!).score).toBe(2);
    expect(rowOf(firstRunnerUp!).gamePoints).toBe(7);
    expect(rowOf(secondRunnerUp!).gamePoints).toBe(6);
    const firstIndex = standings.findIndex((row) => row.playerId === firstRunnerUp);
    const secondIndex = standings.findIndex((row) => row.playerId === secondRunnerUp);
    expect(firstIndex).toBeLessThan(secondIndex);
  });

  it("preserves byes across a re-roll", async () => {
    const { tournament, players } = await freshTournament(5);
    await pairNextRound(repos, tournament, [players[4]!.id]);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await rerollRound(repos, reloaded!, 1);
    const rounds = await loadRounds(tournament.id, scoring);
    expect(rounds[0]!.byes.map((bye) => bye.playerId)).toEqual([players[4]!.id]);
    expect(rounds[0]!.pods[0]!.size).toBe(4);
  });

  it("orders standings by score, then pod wins, then average opponent score", async () => {
    // Two finalized 4-pods. In pod A players tie so scores collide; pod wins and
    // opponent strength then separate them.
    const { tournament, players } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const rounds = await loadRounds(tournament.id, scoring);
    const open = rounds[0]!;
    // Give everyone a 1st (sole win) vs a shared lower finish in their pod so we
    // get a spread of pod wins; placements 1..4 in member order = one sole win each.
    await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    // Sorted by score desc; the two pod winners (3 pts, 1 win) lead.
    expect(standings[0]!.score).toBe(3);
    expect(standings[0]!.podWins).toBe(1);
    // Monotonic non-increasing on the composite key.
    for (let i = 1; i < standings.length; i++) {
      const previous = standings[i - 1]!;
      const current = standings[i]!;
      const ahead =
        previous.score > current.score ||
        (previous.score === current.score && previous.podWins > current.podWins) ||
        (previous.score === current.score &&
          previous.podWins === current.podWins &&
          previous.avgOpponentScore >= current.avgOpponentScore);
      expect(ahead).toBe(true);
    }
    expect(players).toHaveLength(8);
  });

  it("re-derives standings when the scoring scheme changes", async () => {
    const { tournament } = await freshTournament(6); // 2x 3-pods
    await pairNextRound(repos, tournament);
    const open = await reportOpenRound(tournament.id);
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const standard = await podRepo.computeStandings(tournament.id, scoring);
    // Standard 3-pod scores [3,2,1]: field total across two 3-pods is 12.
    expect(standard.reduce((sum, row) => sum + row.score, 0)).toBe(12);

    await tournamentsRepo.updateSettings(tournament.id, { scoringScheme: "three_pod_reduced" });
    const after = await tournamentsRepo.findById(tournament.id);
    const reduced = await podRepo.computeStandings(tournament.id, scoringOf(after!));
    // Reduced 3-pod scores [3,1.5,0]: field total is 9.
    expect(reduced.reduce((sum, row) => sum + row.score, 0)).toBe(9);
  });

  it("applies a manual pairing edit and recomputes the penalty", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const before = await loadRounds(tournament.id, scoring);
    const open = before[0]!;
    const everyone = open.pods.flatMap((pod) => pod.members.map((member) => member.playerId));
    const reloaded = await tournamentsRepo.findById(tournament.id);

    // Re-partition the same 8 players into a fresh 4+4 split.
    await replaceRoundPairing(
      repos,
      reloaded!,
      open.roundNumber,
      [
        { size: 4, playerIds: everyone.slice(0, 4) },
        { size: 4, playerIds: everyone.slice(4, 8) },
      ],
      [],
    );
    const after = await loadRounds(tournament.id, scoring);
    expect(after[0]!.pairingStrategy).toBe("manual");
    expect(
      after[0]!.pods.flatMap((pod) => pod.members.map((member) => member.playerId)).toSorted(),
    ).toEqual(everyone.toSorted());

    // An invalid partition (a 5-pod) is rejected.
    await expect(
      replaceRoundPairing(
        repos,
        reloaded!,
        open.roundNumber,
        [
          { size: 4, playerIds: everyone.slice(0, 5) },
          { size: 4, playerIds: everyone.slice(5, 8) },
        ],
        [],
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("moves a player to a bye via a manual edit", async () => {
    const { tournament } = await freshTournament(8);
    await pairNextRound(repos, tournament);
    const before = await loadRounds(tournament.id, scoring);
    const open = before[0]!;
    const everyone = open.pods.flatMap((pod) => pod.members.map((member) => member.playerId));
    const reloaded = await tournamentsRepo.findById(tournament.id);

    // Sit one player out: 7 seated -> 4 + 3, one bye.
    await replaceRoundPairing(
      repos,
      reloaded!,
      open.roundNumber,
      [
        { size: 4, playerIds: everyone.slice(0, 4) },
        { size: 3, playerIds: everyone.slice(4, 7) },
      ],
      [everyone[7]!],
    );
    const after = await loadRounds(tournament.id, scoring);
    expect(after[0]!.byes.map((bye) => bye.playerId)).toEqual([everyone[7]!]);
    expect(after[0]!.pods.map((pod) => pod.size).toSorted()).toEqual([3, 4]);
  });

  // ── Swiss (1v1 matches as 2-player pods) ─────────────────────────────────

  async function freshSwissTournament(playerCount: number) {
    const { tournament, players } = await freshTournament(playerCount);
    await repos.tournaments.updateSettings(tournament.id, { pairingStyle: "swiss" });
    const swiss = await tournamentsRepo.findById(tournament.id);
    return { tournament: swiss!, players };
  }

  it("pairs a swiss round of 2-pods with an auto-bye for an odd field", async () => {
    const { tournament } = await freshSwissTournament(5);
    await pairNextRound(repos, tournament);

    const rounds = await loadRounds(tournament.id, scoring);
    const open = rounds[0]!;
    expect(open.pods).toHaveLength(2);
    expect(open.pods.every((pod) => pod.size === 2)).toBe(true);
    expect(open.byes).toHaveLength(1); // the auto-bye

    // Match 1: member 0 wins 2-0. Match 2: a 1-1 draw.
    const [first, second] = open.pods;
    await submitPodResult(
      repos,
      tournament.id,
      first!.id,
      [
        { playerId: first!.members[0]!.playerId, gamePoints: 2 },
        { playerId: first!.members[1]!.playerId, gamePoints: 0 },
      ],
      { allowFinalized: false },
    );
    await submitPodResult(
      repos,
      tournament.id,
      second!.id,
      [
        { playerId: second!.members[0]!.playerId, gamePoints: 1 },
        { playerId: second!.members[1]!.playerId, gamePoints: 1 },
      ],
      { allowFinalized: false },
    );
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, open.roundNumber);

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    const rowOf = (id: string) => standings.find((row) => row.playerId === id)!;
    const winner = rowOf(first!.members[0]!.playerId);
    const loser = rowOf(first!.members[1]!.playerId);
    const drawnA = rowOf(second!.members[0]!.playerId);
    const byeRow = rowOf(open.byes[0]!.playerId);
    expect(winner.score).toBe(3); // win points
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(loser.score).toBe(0);
    expect(loser.losses).toBe(1);
    expect(drawnA.score).toBe(1); // draw points
    expect(drawnA.draws).toBe(1);
    expect(byeRow.score).toBe(3); // bye points
    expect(byeRow.byeCount).toBe(1);
    // 2-pods never count toward the pod tallies.
    expect(standings.every((row) => row.pods3Count === 0 && row.pods4Count === 0)).toBe(true);
  });

  it("scores swiss matches by the configured win and draw points", async () => {
    const { tournament } = await freshSwissTournament(2);
    await repos.tournaments.updateSettings(tournament.id, { winPoints: 5, drawPoints: 2 });
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await pairNextRound(repos, reloaded!);
    const rounds = await loadRounds(tournament.id, scoringOf(reloaded!));
    const match = rounds[0]!.pods[0]!;
    await submitPodResult(
      repos,
      tournament.id,
      match.id,
      [
        { playerId: match.members[0]!.playerId, gamePoints: 2 },
        { playerId: match.members[1]!.playerId, gamePoints: 1 },
      ],
      { allowFinalized: false },
    );
    await finalizeRound(repos, reloaded!, 1);
    const standings = await podRepo.computeStandings(tournament.id, scoringOf(reloaded!));
    expect(standings[0]!.score).toBe(5);
    expect(standings[1]!.score).toBe(0);
    expect(standings[0]!.gamePoints).toBe(2);
  });

  it("does not repeat the auto-bye while others have fewer byes", async () => {
    const { tournament } = await freshSwissTournament(3);
    await pairNextRound(repos, tournament);
    const rounds = await loadRounds(tournament.id, scoring);
    const open = rounds[0]!;
    const firstBye = open.byes[0]!.playerId;
    const match = open.pods[0]!;
    await submitPodResult(
      repos,
      tournament.id,
      match.id,
      [
        { playerId: match.members[0]!.playerId, gamePoints: 2 },
        { playerId: match.members[1]!.playerId, gamePoints: 0 },
      ],
      { allowFinalized: false },
    );
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await finalizeRound(repos, reloaded!, 1);

    const afterRound1 = await tournamentsRepo.findById(tournament.id);
    await pairNextRound(repos, afterRound1!);
    const allRounds = await loadRounds(tournament.id, scoring);
    const round2 = allRounds.find((round) => round.roundNumber === 2)!;
    expect(round2.byes).toHaveLength(1);
    expect(round2.byes[0]!.playerId).not.toBe(firstBye);
  });

  it("round-trips the participant region into snapshots and standings", async () => {
    const { tournament, players } = await freshSwissTournament(4);
    await repos.tournaments.updateSettings(tournament.id, { regionsEnabled: true });
    await repos.tournaments.updateParticipant(players[0]!.id, { region: "noxus" });
    await repos.tournaments.updateParticipant(players[1]!.id, { region: "noxus" });

    const snapshot = await podRepo.loadPairingSnapshot(tournament.id, scoring);
    expect(snapshot.find((player) => player.id === players[0]!.id)!.region).toBe("noxus");
    expect(snapshot.find((player) => player.id === players[2]!.id)!.region).toBeNull();

    const standings = await podRepo.computeStandings(tournament.id, scoring);
    expect(standings.find((row) => row.playerId === players[1]!.id)!.region).toBe("noxus");

    // Pairing rejects a seated player without a region, so give the other two
    // theirs before generating.
    await repos.tournaments.updateParticipant(players[2]!.id, { region: "demacia" });
    await repos.tournaments.updateParticipant(players[3]!.id, { region: "demacia" });

    // The engine avoids the noxus mirror: 4 players, two of them noxus, so a
    // region-clean perfect matching exists and must be found.
    const reloaded = await tournamentsRepo.findById(tournament.id);
    await pairNextRound(repos, reloaded!);
    const pairedRounds = await loadRounds(tournament.id, scoring);
    for (const pod of pairedRounds[0]!.pods) {
      const ids = pod.members.map((member) => member.playerId);
      expect(ids.includes(players[0]!.id) && ids.includes(players[1]!.id)).toBe(false);
    }
  });

  it("rejects wrong pod sizes per pairing style on a manual edit", async () => {
    const { tournament } = await freshSwissTournament(4);
    await pairNextRound(repos, tournament);
    const openRounds = await loadRounds(tournament.id, scoring);
    const open = openRounds[0]!;
    const everyone = open.pods.flatMap((pod) => pod.members.map((member) => member.playerId));
    const reloaded = await tournamentsRepo.findById(tournament.id);

    // A 4-pod is invalid in a swiss tournament...
    await expect(
      replaceRoundPairing(
        repos,
        reloaded!,
        open.roundNumber,
        [{ size: 4, playerIds: everyone }],
        [],
      ),
    ).rejects.toMatchObject({ status: 400 });
    // ...while swapping the two matches manually is fine.
    await replaceRoundPairing(
      repos,
      reloaded!,
      open.roundNumber,
      [
        { size: 2, playerIds: [everyone[0]!, everyone[2]!] },
        { size: 2, playerIds: [everyone[1]!, everyone[3]!] },
      ],
      [],
    );
    const afterRounds = await loadRounds(tournament.id, scoring);
    expect(afterRounds[0]!.pairingStrategy).toBe("manual");
    expect(afterRounds[0]!.pods.every((pod) => pod.size === 2)).toBe(true);
  });
});
