import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
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
    scoringScheme: podScoringSchemeSchema,
    byePoints: z.number().int().nonnegative(),
    standings: z.array(podStandingRowSchema),
    rounds: z.array(podRoundResponseSchema),
  })
  .openapi("PodReportResponse");

/**
 * oRPC contract for the public, token-gated pod-tournament participant surface
 * (ADR-022). `GET .../report/{token}` is a read-only follow-along; the PUT
 * submits one pod's result. A disabled/rotated token is a typed NOT_FOUND.
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
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(podReportResponseSchema),
};

export type PublicPodTournamentsContract = typeof publicPodTournamentsContract;
