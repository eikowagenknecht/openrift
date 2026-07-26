import type { PodReportResponse } from "@openrift/shared";
import { publicPodTournamentsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { scoringOf } from "../../repositories/pod-tournaments.js";
import type { PodTournament } from "../../repositories/pod-tournaments.js";
import { submitPodPlayerResult, submitPodResult } from "../../services/pod-pairing.js";

/**
 * Builds the token-gated follow-along payload: standings plus every round's
 * pairings with the penalty / fairness internals stripped (organizer-only).
 * @returns The participant-facing report payload.
 */
async function buildReport(
  repos: Repos,
  tournament: PodTournament,
  canSubmit: boolean,
): Promise<PodReportResponse> {
  const scoring = scoringOf(tournament);
  const [standings, rounds] = await Promise.all([
    repos.podTournaments.computeStandings(tournament.id, scoring),
    repos.podTournaments.loadRounds(tournament.id, scoring),
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
    rounds: rounds.map((round) => ({
      ...round,
      penaltyTotal: null,
      pods: round.pods.map((pod) => ({ ...pod, penalty: null })),
    })),
    canSubmit,
  };
}

const os = implement(publicPodTournamentsContract).$context<ApiContext>().use(requireUser);

/**
 * Public, token-gated pod-tournament surface (ADR-022). The not-found case is
 * a typed NOT_FOUND, and AppErrors thrown by `submitPodResult` (bad state /
 * conflict) reach the client through the global error interceptor, which maps
 * their status + code onto the response.
 */
export const publicPodTournamentsRouter = {
  report: os.report.handler(async ({ input, context, errors }): Promise<PodReportResponse> => {
    const repos = context.repos;
    const tournament = await repos.podTournaments.findByShareToken(input.token);
    // The follow-along report is a pairing-engine surface (pods or Swiss). A
    // no-pairing tournament has no pairings or standings to show, so even with a
    // live token it is treated as not found rather than rendering an empty shell.
    if (!tournament || tournament.pairingStyle === "none") {
      throw errors.NOT_FOUND({ message: "Not found" });
    }
    // Only the report token grants result entry; the follow token is read-only.
    const canSubmit = tournament.reportToken === input.token;
    return buildReport(repos, tournament, canSubmit);
  }),

  submitResult: os.submitResult.handler(
    async ({ input, context, errors }): Promise<PodReportResponse> => {
      const repos = context.repos;
      const tournament = await repos.podTournaments.findByShareToken(input.token);
      if (!tournament || tournament.pairingStyle === "none") {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      // The read-only follow token resolves the report but cannot enter results.
      if (tournament.reportToken !== input.token) {
        throw errors.FORBIDDEN({ message: "This link is follow-only" });
      }
      // submitPodResult throws AppError on bad state (round not reporting,
      // conflict); the global error interceptor maps it to the typed response.
      await submitPodResult(repos, tournament.id, input.podId, input.results, {
        allowFinalized: false,
      });
      return buildReport(repos, tournament, true);
    },
  ),

  submitPlayerResult: os.submitPlayerResult.handler(
    async ({ input, context, errors }): Promise<PodReportResponse> => {
      const repos = context.repos;
      const tournament = await repos.podTournaments.findByShareToken(input.token);
      // Both pairing engines seat players in pods, so per-player entry applies to
      // Swiss as much as to pods. Only a no-pairing tournament has nothing to
      // report against.
      if (!tournament || tournament.pairingStyle === "none") {
        throw errors.NOT_FOUND({ message: "Not found" });
      }
      // The read-only follow token resolves the report but cannot enter results.
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
