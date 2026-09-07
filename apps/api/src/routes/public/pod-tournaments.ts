import type { PodReportResponse } from "@openrift/shared";
import { publicPodTournamentsContract } from "@openrift/shared/contracts/public-pod-tournaments";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { toRoundResponse } from "../../lib/pod-tournament-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { scoringOf } from "../../repositories/pod-tournaments.js";
import type { Tournament } from "../../repositories/tournaments.js";
import { submitPodPlayerResult, submitPodResult } from "../../services/pod-pairing.js";

async function buildReport(
  repos: Repos,
  tournament: Tournament,
  canSubmit: boolean,
): Promise<PodReportResponse> {
  const scoring = scoringOf(tournament);
  const [standings, roundRows] = await Promise.all([
    repos.podTournaments.computeStandings(tournament.id, scoring),
    repos.podTournaments.loadRounds(tournament.id),
  ]);
  return {
    tournamentName: tournament.name,
    status: tournament.status,
    currentRound: tournament.currentRound,
    pairingStyle: tournament.pairingStyle,
    playMode: tournament.playMode,
    scoringScheme: tournament.scoringScheme,
    byePoints: tournament.byePoints,
    matchFormat: tournament.matchFormat,
    winPoints: tournament.winPoints,
    drawPoints: tournament.drawPoints,
    regionsEnabled: tournament.regionsEnabled,
    standings,
    rounds: roundRows.map((rows) => {
      const round = toRoundResponse(rows, scoring);
      return {
        ...round,
        penaltyTotal: null,
        pods: round.pods.map((pod) => ({ ...pod, penalty: null })),
      };
    }),
    canSubmit,
  };
}

const os = implement(publicPodTournamentsContract).$context<ApiContext>().use(requireUser);

export const publicPodTournamentsRouter = {
  report: os.report.handler(async ({ input, context, errors }): Promise<PodReportResponse> => {
    const repos = context.repos;
    const tournament = await repos.tournaments.findByShareToken(input.token);
    // A no-pairing tournament has nothing to report, so it is treated as not found.
    if (!tournament || tournament.pairingStyle === "none") {
      throw errors.NOT_FOUND({ message: "Not found" });
    }
    const canSubmit = tournament.reportToken === input.token;
    return buildReport(repos, tournament, canSubmit);
  }),

  submitResult: os.submitResult.handler(
    async ({ input, context, errors }): Promise<PodReportResponse> => {
      const repos = context.repos;
      const tournament = await repos.tournaments.findByShareToken(input.token);
      if (!tournament || tournament.pairingStyle === "none") {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      if (tournament.reportToken !== input.token) {
        throw errors.FORBIDDEN({ message: "This link is follow-only" });
      }
      await submitPodResult(repos, tournament.id, input.podId, input.results, {
        allowFinalized: false,
      });
      return buildReport(repos, tournament, true);
    },
  ),

  submitPlayerResult: os.submitPlayerResult.handler(
    async ({ input, context, errors }): Promise<PodReportResponse> => {
      const repos = context.repos;
      const tournament = await repos.tournaments.findByShareToken(input.token);
      // Swiss also seats players in pods, so per-player entry applies to it too.
      if (!tournament || tournament.pairingStyle === "none") {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      if (tournament.reportToken !== input.token) {
        throw errors.FORBIDDEN({ message: "This link is follow-only" });
      }
      await submitPodPlayerResult(
        repos,
        tournament.id,
        input.podId,
        input.playerId,
        input.gamePoints,
      );
      return buildReport(repos, tournament, true);
    },
  ),
};
