import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { cardTypeSchema, imageIdSchema, raritySchema } from "@openrift/shared/response-schemas";
import { keysetCursorSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const collectionEventsQuerySchema = z.object({
  // Same keyset shape produced by collection-events.ts's buildEventsCursor:
  // an ISO 8601 timestamp, optionally suffixed with "_<id>". Rejecting
  // malformed cursors here means a garbage `cursor` fails with a 400 instead
  // of reaching the repo's `new Date(...)` and producing a 500.
  cursor: keysetCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const activityActionSchema = z.enum(["added", "removed", "moved"]);

export const collectionEventResponseSchema = z
  .object({
    id: z.string(),
    action: activityActionSchema,
    copyId: z.string().nullable(),
    printingId: z.string(),
    fromCollectionId: z.string().nullable(),
    fromCollectionName: z.string().nullable(),
    toCollectionId: z.string().nullable(),
    toCollectionName: z.string().nullable(),
    createdAt: z.string(),
    shortCode: z.string(),
    rarity: raritySchema,
    imageId: imageIdSchema.nullable(),
    cardName: z.string(),
    cardTypes: z.array(cardTypeSchema).nonempty(),
    cardSuperTypes: z.array(z.string()),
    tags: z.array(z.string()),
  })
  .openapi("CollectionEventResponse");

export const collectionEventListResponseSchema = z
  .object({
    items: z.array(collectionEventResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi("CollectionEventListResponse");

/**
 * oRPC contract for the authenticated collection-events feed.
 * `GET /api/v1/collection-events?cursor&limit` — cursor-paginated activity.
 * Requires a session (UNAUTHORIZED on missing session).
 */
export const collectionEventsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/collection-events", tags: ["Collection Events"] })
    .input(collectionEventsQuerySchema)
    .output(collectionEventListResponseSchema),
};

export type CollectionEventsContract = typeof collectionEventsContract;
