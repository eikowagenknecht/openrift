import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  cutSizeSchema,
  groupStageViewSchema,
  podMatchFormatSchema,
  podPairingStyleSchema,
  podPlayModeSchema,
  podRoundResponseSchema,
  podScoringSchemeSchema,
  podStandingRowSchema,
  podTournamentStatusSchema,
  tournamentFormatSchema,
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
    playMode: podPlayModeSchema,
    scoringScheme: podScoringSchemeSchema,
    byePoints: z.number().int().nonnegative(),
    matchFormat: podMatchFormatSchema,
    winPoints: z.number().int().nonnegative(),
    drawPoints: z.number().int().nonnegative(),
    regionsEnabled: z.boolean(),
    format: tournamentFormatSchema,
    cutSize: cutSizeSchema,
    legendTiebreak: z.boolean(),
    groupsSelfPaced: z.boolean(),
    standings: z.array(podStandingRowSchema),
    rounds: z.array(podRoundResponseSchema),
    /** Null unless `format` is `group_cut`. */
    groupStage: groupStageViewSchema.nullable(),
    canSubmit: z.boolean(),
  })
  .openapi("PodReportResponse");

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
  // Needs the report token, not the follow token, and `groupsSelfPaced`.
  startGroupRound: oc
    .route({
      method: "POST",
      path: "/api/v1/pod-tournaments/report/{token}/groups/{groupId}/rounds",
      tags: ["Pod Tournaments"],
    })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1), groupId: z.uuid() }))
    .errors({
      NOT_FOUND: { message: "Not found" },
      FORBIDDEN: { message: "This link cannot start rounds" },
      CONFLICT: { message: "The group's current round is not fully reported" },
      BAD_REQUEST: { message: "Not a group stage tournament" },
    })
    .output(podReportResponseSchema),
};

export type PublicPodTournamentsContract = typeof publicPodTournamentsContract;
