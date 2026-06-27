import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  deckAvailabilityResponseSchema,
  deckCardsResponseSchema,
  deckCloneResponseSchema,
  deckDetailResponseSchema,
  deckExportResponseSchema,
  deckListResponseSchema,
  deckPlanDetailResponseSchema,
  deckResponseSchema,
  deckShareResponseSchema,
} from "../response-schemas.js";
import {
  createDeckSchema,
  deckExportQuerySchema,
  decksQuerySchema,
  idParamSchema,
  updateDeckCardsSchema,
  updateDeckPlanSchema,
  updateDeckSchema,
  withParams,
} from "../schemas.js";

const TAG = "Decks";

const shareTokenParamSchema = z.object({ token: z.string().min(1) });
const pinDeckBodySchema = z.object({ isPinned: z.boolean() });
const archiveDeckBodySchema = z.object({ archived: z.boolean() });

/**
 * oRPC contract for the authenticated decks endpoints (mounted at
 * `/api/v1/decks`). All require a session. Bad-request (unknown format /
 * malformed plan or format-config) and not-found states are thrown as
 * `AppError` and bridged to ORPCErrors in the implementation, so the contract
 * declares no per-code typed errors.
 */
export const decksContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/decks", tags: [TAG] })
    .input(decksQuerySchema)
    .output(deckListResponseSchema),
  create: oc
    .route({ method: "POST", path: "/api/v1/decks", tags: [TAG], successStatus: 201 })
    .input(createDeckSchema)
    .output(deckResponseSchema),
  get: oc
    .route({ method: "GET", path: "/api/v1/decks/{id}", tags: [TAG] })
    .input(idParamSchema)
    .output(deckDetailResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/v1/decks/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateDeckSchema))
    .output(deckResponseSchema),
  remove: oc
    .route({ method: "DELETE", path: "/api/v1/decks/{id}", tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
  replaceCards: oc
    .route({ method: "PUT", path: "/api/v1/decks/{id}/cards", tags: [TAG] })
    .input(withParams(idParamSchema, updateDeckCardsSchema))
    .output(deckCardsResponseSchema),
  getPlan: oc
    .route({ method: "GET", path: "/api/v1/decks/{id}/plan", tags: [TAG] })
    .input(idParamSchema)
    .output(deckPlanDetailResponseSchema),
  replacePlan: oc
    .route({ method: "PUT", path: "/api/v1/decks/{id}/plan", tags: [TAG] })
    .input(withParams(idParamSchema, updateDeckPlanSchema))
    .output(deckPlanDetailResponseSchema),
  clone: oc
    .route({ method: "POST", path: "/api/v1/decks/{id}/clone", tags: [TAG], successStatus: 201 })
    .input(idParamSchema)
    .output(deckResponseSchema),
  availability: oc
    .route({ method: "GET", path: "/api/v1/decks/{id}/availability", tags: [TAG] })
    .input(idParamSchema)
    .output(deckAvailabilityResponseSchema),
  export: oc
    .route({ method: "GET", path: "/api/v1/decks/{id}/export", tags: [TAG] })
    .input(withParams(idParamSchema, deckExportQuerySchema))
    .output(deckExportResponseSchema),
  setPinned: oc
    .route({ method: "PATCH", path: "/api/v1/decks/{id}/pin", tags: [TAG] })
    .input(withParams(idParamSchema, pinDeckBodySchema))
    .output(deckResponseSchema),
  setArchived: oc
    .route({ method: "PATCH", path: "/api/v1/decks/{id}/archive", tags: [TAG] })
    .input(withParams(idParamSchema, archiveDeckBodySchema))
    .output(deckResponseSchema),
  getShare: oc
    .route({ method: "GET", path: "/api/v1/decks/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .output(deckShareResponseSchema),
  share: oc
    .route({ method: "POST", path: "/api/v1/decks/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .output(deckShareResponseSchema),
  rotateShare: oc
    .route({ method: "POST", path: "/api/v1/decks/{id}/share/rotate", tags: [TAG] })
    .input(idParamSchema)
    .output(deckShareResponseSchema),
  unshare: oc
    .route({ method: "DELETE", path: "/api/v1/decks/{id}/share", tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
  cloneShared: oc
    .route({
      method: "POST",
      path: "/api/v1/decks/share/{token}/clone",
      tags: [TAG],
      successStatus: 201,
    })
    .input(shareTokenParamSchema)
    .output(deckCloneResponseSchema),
};

export type DecksContract = typeof decksContract;
