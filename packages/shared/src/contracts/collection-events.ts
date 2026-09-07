import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { cardTypeSchema, imageIdSchema, raritySchema } from "@openrift/shared/response-schemas";
import { keysetCursorSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const collectionEventsQuerySchema = z.object({
  cursor: keysetCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const activityActionSchema = z.enum(["added", "removed", "moved"]);

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

export const collectionEventsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/collection-events", tags: ["Collection Events"] })
    .input(collectionEventsQuerySchema)
    .output(collectionEventListResponseSchema),
};

export type CollectionEventsContract = typeof collectionEventsContract;
