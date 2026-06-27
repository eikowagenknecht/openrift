import { oc } from "@orpc/contract";

import {
  collectionGroupSharesResponseSchema,
  collectionListResponseSchema,
  collectionResponseSchema,
  collectionShareResponseSchema,
  copyListResponseSchema,
} from "../response-schemas.js";
import {
  copiesQuerySchema,
  createCollectionSchema,
  idParamSchema,
  reorderCollectionsSchema,
  setCollectionDeckbuildingSchema,
  updateCollectionSchema,
  withParams,
} from "../schemas.js";

const TAG = "Collections";

/**
 * oRPC contract for the authenticated collections endpoints (mounted at
 * `/api/v1/collections`). All require a session (the mount applies
 * `requireAuth`). Not-found / forbidden / conflict states thrown by the
 * handlers (`AppError`) are bridged to ORPCErrors in the implementation, so the
 * contract declares no per-code typed errors.
 */
export const collectionsContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/collections", tags: [TAG] })
    .output(collectionListResponseSchema),
  create: oc
    .route({ method: "POST", path: "/api/v1/collections", tags: [TAG], successStatus: 201 })
    .input(createCollectionSchema)
    .output(collectionResponseSchema),
  reorder: oc
    .route({ method: "POST", path: "/api/v1/collections/reorder", tags: [TAG], successStatus: 204 })
    .input(reorderCollectionsSchema),
  get: oc
    .route({ method: "GET", path: "/api/v1/collections/{id}", tags: [TAG] })
    .input(idParamSchema)
    .output(collectionResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/v1/collections/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateCollectionSchema))
    .output(collectionResponseSchema),
  remove: oc
    .route({ method: "DELETE", path: "/api/v1/collections/{id}", tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
  copies: oc
    .route({ method: "GET", path: "/api/v1/collections/{id}/copies", tags: [TAG] })
    .input(withParams(idParamSchema, copiesQuerySchema))
    .output(copyListResponseSchema),
  share: oc
    .route({ method: "POST", path: "/api/v1/collections/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .output(collectionShareResponseSchema),
  shareState: oc
    .route({ method: "GET", path: "/api/v1/collections/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .output(collectionShareResponseSchema),
  rotateShare: oc
    .route({ method: "POST", path: "/api/v1/collections/{id}/share/rotate", tags: [TAG] })
    .input(idParamSchema)
    .output(collectionShareResponseSchema),
  unshare: oc
    .route({
      method: "DELETE",
      path: "/api/v1/collections/{id}/share",
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParamSchema),
  groupShares: oc
    .route({ method: "GET", path: "/api/v1/collections/{id}/group-shares", tags: [TAG] })
    .input(idParamSchema)
    .output(collectionGroupSharesResponseSchema),
  setDeckbuilding: oc
    .route({
      method: "PUT",
      path: "/api/v1/collections/{id}/deckbuilding",
      tags: [TAG],
      successStatus: 204,
    })
    .input(withParams(idParamSchema, setCollectionDeckbuildingSchema)),
};

export type CollectionsContract = typeof collectionsContract;
