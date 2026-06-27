import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  podTournamentDetailResponseSchema,
  podTournamentListResponseSchema,
  podTournamentResponseSchema,
} from "../response-schemas.js";
import {
  addPodPlayerSchema,
  createPodTournamentSchema,
  generatePodRoundSchema,
  podResultSchema,
  podRoundNumberParamSchema,
  podTournamentIdParamSchema,
  replacePodPairingSchema,
  updatePodPlayerSchema,
  updatePodTournamentSchema,
  withParams,
} from "../schemas.js";

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
