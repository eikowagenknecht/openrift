import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const createDeckFolderSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateDeckFolderSchema = z.object({
  name: z.string().min(1).max(100),
});

/** Not bucket-scoped, unlike lists: folders are a single flat set per user. */
export const reorderDeckFoldersSchema = z.object({
  orderedIds: z.array(z.uuid()).min(1).max(500),
});

/** Folder ids the caller doesn't own are ignored, not rejected. */
export const setDeckFoldersSchema = z.object({
  folderIds: z.array(z.uuid()).max(100),
});

export const deckFolderResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sortOrder: z.number().int(),
    deckCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("DeckFolderResponse");

export const deckFolderListResponseSchema = z
  .object({ items: z.array(deckFolderResponseSchema) })
  .openapi("DeckFolderListResponse");

const TAG = "Deck folders";

export const deckFoldersContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/deck-folders", tags: [TAG] })
    .output(deckFolderListResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/deck-folders", tags: [TAG], successStatus: 201 })
    .input(createDeckFolderSchema)
    .errors({ CONFLICT: { message: "You already have a folder with that name" } })
    .output(deckFolderResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: "/api/v1/deck-folders/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateDeckFolderSchema))
    .errors({
      NOT_FOUND: { message: "Folder not found" },
      CONFLICT: { message: "You already have a folder with that name" },
    })
    .output(deckFolderResponseSchema),
  remove: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/deck-folders/{id}",
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Folder not found" } }),
  reorder: authedRoute
    .route({
      method: "POST",
      path: "/api/v1/deck-folders/reorder",
      tags: [TAG],
      successStatus: 204,
    })
    .input(reorderDeckFoldersSchema),
  setForDeck: authedRoute
    .route({ method: "PUT", path: "/api/v1/decks/{id}/folders", tags: [TAG] })
    .input(withParams(idParamSchema, setDeckFoldersSchema))
    .errors({ NOT_FOUND: { message: "Deck not found" } })
    .output(deckFolderListResponseSchema),
};
