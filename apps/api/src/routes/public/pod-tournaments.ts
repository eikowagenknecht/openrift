import { createRoute, z } from "@hono/zod-openapi";
import type { PodReportResponse } from "@openrift/shared";
import { podReportResponseSchema } from "@openrift/shared/response-schemas";
import { podResultSchema } from "@openrift/shared/schemas";

import type { Repos } from "../../deps.js";
import { errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
import type { PodTournament } from "../../repositories/pod-tournaments.js";
import { submitPodResult } from "../../services/pod-pairing.js";
import { assertFound } from "../../utils/assertions.js";

const tokenParam = z.object({ token: z.string().min(1) });
const tokenPodParam = z.object({ token: z.string().min(1), podId: z.uuid() });

/**
 * Builds the token-gated follow-along payload: standings plus every round's
 * pairings with the penalty / fairness internals stripped (organizer-only).
 * @returns The participant-facing report payload.
 */
async function buildReport(repos: Repos, tournament: PodTournament): Promise<PodReportResponse> {
  const [standings, rounds] = await Promise.all([
    repos.podTournaments.computeStandings(
      tournament.id,
      tournament.scoringScheme,
      tournament.byePoints,
    ),
    repos.podTournaments.loadRounds(tournament.id, tournament.scoringScheme),
  ]);
  return {
    tournamentName: tournament.name,
    status: tournament.status,
    currentRound: tournament.currentRound,
    scoringScheme: tournament.scoringScheme,
    byePoints: tournament.byePoints,
    standings,
    rounds: rounds.map((round) => ({
      ...round,
      penaltyTotal: null,
      pods: round.pods.map((pod) => ({ ...pod, penalty: null })),
    })),
  };
}

const getReport = createRoute({
  method: "get",
  path: "/pod-tournaments/report/{token}",
  tags: ["Pod Tournaments"],
  request: { params: tokenParam },
  responses: {
    200: {
      content: { "application/json": { schema: podReportResponseSchema } },
      description: "Follow-along",
    },
    ...errorResponses(404),
  },
});

const submitReport = createRoute({
  method: "put",
  path: "/pod-tournaments/report/{token}/pods/{podId}/result",
  tags: ["Pod Tournaments"],
  request: {
    params: tokenPodParam,
    body: { content: { "application/json": { schema: podResultSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: podReportResponseSchema } },
      description: "Updated follow-along",
    },
    ...errorResponses(400, 404, 409),
  },
});

/**
 * Public, token-gated participant surface (ADR-022). The report token resolves
 * to one tournament; it grants a read-only follow-along plus exactly one write:
 * submitting a pod's result while its round is `reporting`. A disabled / rotated
 * token simply fails the lookup (404).
 */
export const publicPodTournamentsRoute = createApiApp()
  .openapi(getReport, async (c) => {
    const repos = c.get("repos");
    const tournament = await repos.podTournaments.findByReportToken(c.req.valid("param").token);
    assertFound(tournament, "Not found");
    return c.json(await buildReport(repos, tournament), 200);
  })

  .openapi(submitReport, async (c) => {
    const repos = c.get("repos");
    const { token, podId } = c.req.valid("param");
    const tournament = await repos.podTournaments.findByReportToken(token);
    assertFound(tournament, "Not found");
    await submitPodResult(repos, tournament.id, podId, c.req.valid("json").results, {
      allowFinalized: false,
    });
    return c.json(await buildReport(repos, tournament), 200);
  });
