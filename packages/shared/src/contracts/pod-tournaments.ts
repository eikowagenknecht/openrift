import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  podPlayerStatusSchema,
  podRoundResponseSchema,
  podScoringSchemeSchema,
  podStandingRowSchema,
  podTournamentStatusSchema,
} from "@openrift/shared/response-schemas";
import { podResultSchema, withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const createPodTournamentSchema = z.object({
  name: z.string().min(1).max(120),
});

export const updatePodTournamentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(["running", "completed"]).optional(),
  scoringScheme: z.enum(["standard", "three_pod_reduced"]).optional(),
  byePoints: z.number().int().min(0).max(99).optional(),
});

export const podTournamentIdParamSchema = z.object({ id: z.uuid() });

export const podRoundNumberParamSchema = z.object({
  id: z.uuid(),
  roundNumber: z.coerce.number().int().positive(),
});

/**
 * Pair the next round. `byes` lists active players the organizer is sitting out
 * this round (manual byes); the rest are paired. Used to resolve an otherwise
 * unrepresentable field (1, 2, or 5 active players) or to sit a leaver out.
 */
export const generatePodRoundSchema = z.object({
  byes: z.array(z.uuid()).default([]),
});

/**
 * A manual whole-round pairing edit: the new pods plus the players sitting out.
 * The server validates pod sizes (3 or 4), full coverage of the round's players,
 * and that byes are active, then recomputes the penalty.
 */
export const replacePodPairingSchema = z.object({
  pods: z
    .array(
      z.object({
        size: z.union([z.literal(3), z.literal(4)]),
        playerIds: z.array(z.uuid()),
      }),
    )
    .min(0),
  byes: z.array(z.uuid()),
});

export const addPodPlayerSchema = z.object({
  displayName: z.string().min(1).max(80),
});

export const updatePodPlayerSchema = z.object({
  displayName: z.string().min(1).max(80),
});

export const podTournamentResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: podTournamentStatusSchema,
    currentRound: z.number().int().nonnegative(),
    scoringScheme: podScoringSchemeSchema,
    byePoints: z.number().int().nonnegative(),
    reportToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PodTournamentResponse");

export const podTournamentSummaryResponseSchema = podTournamentResponseSchema
  .extend({
    playerCount: z.number().int().nonnegative(),
    activePlayerCount: z.number().int().nonnegative(),
    roundCount: z.number().int().nonnegative(),
  })
  .openapi("PodTournamentSummaryResponse");

export const podTournamentListResponseSchema = z
  .object({ items: z.array(podTournamentSummaryResponseSchema) })
  .openapi("PodTournamentListResponse");

export const podPlayerResponseSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    status: podPlayerStatusSchema,
    droppedAfterRound: z.number().int().nullable(),
    createdAt: z.string(),
  })
  .openapi("PodPlayerResponse");

const podSnapshotPlayerSchema = z.object({
  playerId: z.string(),
  score: z.number(),
  pods3: z.number().int().nonnegative(),
  pods4: z.number().int().nonnegative(),
  byes: z.number().int().nonnegative(),
  opponents: z.record(z.string(), z.number().int().nonnegative()),
});

export const podTournamentDetailResponseSchema = z
  .object({
    tournament: podTournamentResponseSchema,
    players: z.array(podPlayerResponseSchema),
    standings: z.array(podStandingRowSchema),
    rounds: z.array(podRoundResponseSchema),
    openRoundSnapshot: z.array(podSnapshotPlayerSchema).nullable(),
  })
  .openapi("PodTournamentDetailResponse");

const TAG = "Pod Tournaments";

const playerParamSchema = z.object({ id: z.uuid(), playerId: z.uuid() });
const podParamSchema = z.object({ id: z.uuid(), podId: z.uuid() });

/**
 * oRPC contract for the authenticated pod-tournament organizer surface (ADR-022),
 * mounted at `/api/v1/pod-tournaments`. Every endpoint is owner-only; the
 * handlers throw `AppError` (404 missing / 403 not-owner / 409 conflict) which
 * is bridged to ORPCErrors, so the contract declares no per-code typed errors.
 * Most mutations return the full refreshed detail payload.
 */
export const podTournamentsContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/pod-tournaments", tags: [TAG] })
    .output(podTournamentListResponseSchema),
  create: oc
    .route({ method: "POST", path: "/api/v1/pod-tournaments", tags: [TAG], successStatus: 201 })
    .input(createPodTournamentSchema)
    .output(podTournamentResponseSchema),
  get: oc
    .route({ method: "GET", path: "/api/v1/pod-tournaments/{id}", tags: [TAG] })
    .input(podTournamentIdParamSchema)
    .output(podTournamentDetailResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/v1/pod-tournaments/{id}", tags: [TAG] })
    .input(withParams(podTournamentIdParamSchema, updatePodTournamentSchema))
    .output(podTournamentDetailResponseSchema),
  remove: oc
    .route({
      method: "DELETE",
      path: "/api/v1/pod-tournaments/{id}",
      tags: [TAG],
      successStatus: 204,
    })
    .input(podTournamentIdParamSchema),
  addPlayer: oc
    .route({ method: "POST", path: "/api/v1/pod-tournaments/{id}/players", tags: [TAG] })
    .input(withParams(podTournamentIdParamSchema, addPodPlayerSchema))
    .output(podTournamentDetailResponseSchema),
  renamePlayer: oc
    .route({
      method: "PATCH",
      path: "/api/v1/pod-tournaments/{id}/players/{playerId}",
      tags: [TAG],
    })
    .input(withParams(playerParamSchema, updatePodPlayerSchema))
    .output(podTournamentDetailResponseSchema),
  dropPlayer: oc
    .route({
      method: "POST",
      path: "/api/v1/pod-tournaments/{id}/players/{playerId}/drop",
      tags: [TAG],
    })
    .input(playerParamSchema)
    .output(podTournamentDetailResponseSchema),
  reactivatePlayer: oc
    .route({
      method: "POST",
      path: "/api/v1/pod-tournaments/{id}/players/{playerId}/reactivate",
      tags: [TAG],
    })
    .input(playerParamSchema)
    .output(podTournamentDetailResponseSchema),
  removePlayer: oc
    .route({
      method: "DELETE",
      path: "/api/v1/pod-tournaments/{id}/players/{playerId}",
      tags: [TAG],
    })
    .input(playerParamSchema)
    .output(podTournamentDetailResponseSchema),
  generateRound: oc
    .route({ method: "POST", path: "/api/v1/pod-tournaments/{id}/rounds", tags: [TAG] })
    .input(withParams(podTournamentIdParamSchema, generatePodRoundSchema))
    .output(podTournamentDetailResponseSchema),
  replacePairing: oc
    .route({
      method: "PUT",
      path: "/api/v1/pod-tournaments/{id}/rounds/{roundNumber}/pairing",
      tags: [TAG],
    })
    .input(withParams(podRoundNumberParamSchema, replacePodPairingSchema))
    .output(podTournamentDetailResponseSchema),
  rerollRound: oc
    .route({
      method: "POST",
      path: "/api/v1/pod-tournaments/{id}/rounds/{roundNumber}/reroll",
      tags: [TAG],
    })
    .input(podRoundNumberParamSchema)
    .output(podTournamentDetailResponseSchema),
  finalizeRound: oc
    .route({
      method: "POST",
      path: "/api/v1/pod-tournaments/{id}/rounds/{roundNumber}/finalize",
      tags: [TAG],
    })
    .input(podRoundNumberParamSchema)
    .output(podTournamentDetailResponseSchema),
  submitResult: oc
    .route({
      method: "PUT",
      path: "/api/v1/pod-tournaments/{id}/pods/{podId}/result",
      tags: [TAG],
    })
    .input(withParams(podParamSchema, podResultSchema))
    .output(podTournamentDetailResponseSchema),
  enableReportToken: oc
    .route({ method: "POST", path: "/api/v1/pod-tournaments/{id}/report-token", tags: [TAG] })
    .input(podTournamentIdParamSchema)
    .output(podTournamentDetailResponseSchema),
  disableReportToken: oc
    .route({
      method: "DELETE",
      path: "/api/v1/pod-tournaments/{id}/report-token",
      tags: [TAG],
      successStatus: 200,
    })
    .input(podTournamentIdParamSchema)
    .output(podTournamentDetailResponseSchema),
};

export type PodTournamentsContract = typeof podTournamentsContract;
