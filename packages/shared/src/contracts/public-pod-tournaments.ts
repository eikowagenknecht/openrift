import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  podMatchFormatSchema,
  podPairingStyleSchema,
  podRoundResponseSchema,
  podScoringSchemeSchema,
  podStandingRowSchema,
  podTournamentStatusSchema,
} from "@openrift/shared/response-schemas";
import { podResultSchema } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const podReportResponseSchema = z
  .object({
    tournamentName: z.string(),
    status: podTournamentStatusSchema,
    currentRound: z.number().int().nonnegative(),
    pairingStyle: podPairingStyleSchema,
    scoringScheme: podScoringSchemeSchema,
    byePoints: z.number().int().nonnegative(),
    matchFormat: podMatchFormatSchema,
    winPoints: z.number().int().nonnegative(),
    drawPoints: z.number().int().nonnegative(),
    regionsEnabled: z.boolean(),
    standings: z.array(podStandingRowSchema),
    rounds: z.array(podRoundResponseSchema),
    /** Whether this link may submit results (report token) or is follow-only. */
    canSubmit: z.boolean(),
  })
  .openapi("PodReportResponse");

/**
 * oRPC contract for the public, token-gated pod-tournament participant surface
 * (ADR-022). `GET .../report/{token}` is a read-only follow-along; the PUTs
 * submit results — `submitResult` a whole pod at once, `submitPlayerResult` a
 * single player's own game points (the pod completes once every member has
 * points). A disabled/rotated token is a typed NOT_FOUND. The submit routes
 * additionally produce CONFLICT when the round is already finalized and
 * BAD_REQUEST when the submitted results are invalid.
 */
export const publicPodTournamentsContract = {
  report: oc
    .route({
      method: "GET",
      path: "/api/v1/pod-tournaments/report/{token}",
      tags: ["Pod Tournaments"],
    })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(podReportResponseSchema),
  submitResult: oc
    .route({
      method: "PUT",
      path: "/api/v1/pod-tournaments/report/{token}/pods/{podId}/result",
      tags: ["Pod Tournaments"],
    })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1), podId: z.uuid() }).extend(podResultSchema.shape))
    .errors({
      NOT_FOUND: { message: "Not found" },
      FORBIDDEN: { message: "This link is follow-only" },
      CONFLICT: { message: "Round already finalized" },
      BAD_REQUEST: { message: "Invalid result data" },
    })
    .output(podReportResponseSchema),
  submitPlayerResult: oc
    .route({
      method: "PUT",
      path: "/api/v1/pod-tournaments/report/{token}/pods/{podId}/players/{playerId}/result",
      tags: ["Pod Tournaments"],
    })
    .meta({ auth: "public" })
    .input(
      z.object({
        token: z.string().min(1),
        podId: z.uuid(),
        playerId: z.uuid(),
        gamePoints: z.number().int().min(0).max(99),
      }),
    )
    .errors({
      NOT_FOUND: { message: "Not found" },
      FORBIDDEN: { message: "This link is follow-only" },
      CONFLICT: { message: "Round already finalized" },
      BAD_REQUEST: { message: "Invalid result data" },
    })
    .output(podReportResponseSchema),
};

export type PublicPodTournamentsContract = typeof publicPodTournamentsContract;
