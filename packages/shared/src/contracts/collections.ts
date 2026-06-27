import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { copyListResponseSchema } from "@openrift/shared/response-schemas";
import { copiesQuerySchema, idParamSchema, withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

/**
 * Field rules inlined from api/db/schemas — mirrors DB CHECK constraints for
 * the subset needed by shared request-validation schemas.
 */
const collectionFieldRules = {
  name: z.string().min(1).max(200),
};

export const createCollectionSchema = z.object({
  name: collectionFieldRules.name,
  description: z.string().max(1000).nullish(),
  availableForDeckbuilding: z.boolean().optional(),
  groupSlug: z.string().optional(),
});

export const updateCollectionSchema = z.object({
  name: collectionFieldRules.name.optional(),
  description: z.string().max(1000).nullish(),
  sortOrder: z.number().int().optional(),
});

/**
 * Sets the caller's own deck-building availability for a collection. This is a
 * per-viewer preference (not a property of the collection), so any member with
 * access can set it for themselves — including for shared group collections.
 */
export const setCollectionDeckbuildingSchema = z.object({
  available: z.boolean(),
});

/**
 * Bulk reorder for the user's personal collections. The server re-numbers
 * `sort_order` so that the rows appear in the order given here on the next
 * fetch. Group-owned collections are not reorderable and are ignored if
 * passed; the inbox is treated like any other row.
 */
export const reorderCollectionsSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1).max(500),
});

export const collectionResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    availableForDeckbuilding: z.boolean(),
    isInbox: z.boolean(),
    sortOrder: z.number(),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    copyCount: z.number(),
    totalValueCents: z.number().int().nullable(),
    unpricedCopyCount: z.number().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    groupId: z.string().nullable(),
    groupSlug: z.string().nullable(),
    groupName: z.string().nullable(),
    viewerCanAdmin: z.boolean(),
  })
  .openapi("CollectionResponse");

export const collectionListResponseSchema = z
  .object({ items: z.array(collectionResponseSchema) })
  .openapi("CollectionListResponse");

export const collectionShareResponseSchema = z
  .object({
    // Nullable so GET /{id}/share can report an owned-but-unshared collection
    // as { shareToken: null, isPublic: false } without 404ing. POST/rotate
    // always return a non-null token; this only widens the unshared case.
    shareToken: z.string().nullable(),
    isPublic: z.boolean(),
  })
  .openapi("CollectionShareResponse");

export const collectionGroupSharesResponseSchema = z
  .object({
    items: z.array(
      z.object({
        groupId: z.string(),
        groupSlug: z.string(),
        groupName: z.string(),
      }),
    ),
  })
  .openapi("CollectionGroupSharesResponse");

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
