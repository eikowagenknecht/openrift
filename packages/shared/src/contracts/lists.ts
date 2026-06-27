import { oc } from "@orpc/contract";

import {
  listBulkAddResponseSchema,
  listDetailResponseSchema,
  listEntryResponseSchema,
  listGroupSharesResponseSchema,
  listListResponseSchema,
  listMoveResponseSchema,
  listResponseSchema,
  listShareResponseSchema,
} from "../response-schemas.js";
import {
  bulkAddCopiesToListSchema,
  bulkCreateListEntriesSchema,
  bulkDeleteListEntriesSchema,
  createListSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  listEntryInputShape,
  listIntentQuerySchema,
  moveListEntriesSchema,
  reorderListsSchema,
  updateListEntrySchema,
  updateListSchema,
  withParams,
} from "../schemas.js";

const TAG = "Lists";

/**
 * oRPC contract for the authenticated unified-lists endpoints (wishlist /
 * tradelist / organize; ADR-017), mounted at `/api/v1/lists`. All require a
 * session. Bad-request / not-found / conflict states are thrown as `AppError`
 * and bridged to ORPCErrors in the implementation, so the contract declares no
 * per-code typed errors.
 */
export const listsContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/lists", tags: [TAG] })
    .input(listIntentQuerySchema)
    .output(listListResponseSchema),
  create: oc
    .route({ method: "POST", path: "/api/v1/lists", tags: [TAG], successStatus: 201 })
    .input(createListSchema)
    .output(listResponseSchema),
  get: oc
    .route({ method: "GET", path: "/api/v1/lists/{id}", tags: [TAG] })
    .input(idParamSchema)
    .output(listDetailResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/v1/lists/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateListSchema))
    .output(listResponseSchema),
  remove: oc
    .route({ method: "DELETE", path: "/api/v1/lists/{id}", tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
  createEntry: oc
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries", tags: [TAG], successStatus: 201 })
    .input(withParams(idParamSchema, listEntryInputShape))
    .output(listEntryResponseSchema),
  bulkCreateEntries: oc
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries/bulk", tags: [TAG] })
    .input(withParams(idParamSchema, bulkCreateListEntriesSchema))
    .output(listBulkAddResponseSchema),
  bulkAddFromCopies: oc
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries/from-copies", tags: [TAG] })
    .input(withParams(idParamSchema, bulkAddCopiesToListSchema))
    .output(listBulkAddResponseSchema),
  moveEntries: oc
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries/move", tags: [TAG] })
    .input(withParams(idParamSchema, moveListEntriesSchema))
    .output(listMoveResponseSchema),
  updateEntry: oc
    .route({ method: "PATCH", path: "/api/v1/lists/{id}/entries/{itemId}", tags: [TAG] })
    .input(withParams(idAndItemIdParamSchema, updateListEntrySchema))
    .output(listEntryResponseSchema),
  removeEntry: oc
    .route({
      method: "DELETE",
      path: "/api/v1/lists/{id}/entries/{itemId}",
      tags: [TAG],
      successStatus: 204,
    })
    .input(idAndItemIdParamSchema),
  bulkDeleteEntries: oc
    .route({
      method: "POST",
      path: "/api/v1/lists/{id}/entries/bulk-delete",
      tags: [TAG],
      successStatus: 204,
    })
    .input(withParams(idParamSchema, bulkDeleteListEntriesSchema)),
  getShare: oc
    .route({ method: "GET", path: "/api/v1/lists/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .output(listShareResponseSchema),
  share: oc
    .route({ method: "POST", path: "/api/v1/lists/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .output(listShareResponseSchema),
  rotateShare: oc
    .route({ method: "POST", path: "/api/v1/lists/{id}/share/rotate", tags: [TAG] })
    .input(idParamSchema)
    .output(listShareResponseSchema),
  unshare: oc
    .route({ method: "DELETE", path: "/api/v1/lists/{id}/share", tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
  reorder: oc
    .route({ method: "POST", path: "/api/v1/lists/reorder", tags: [TAG], successStatus: 204 })
    .input(reorderListsSchema),
  groupShares: oc
    .route({ method: "GET", path: "/api/v1/lists/{id}/group-shares", tags: [TAG] })
    .input(idParamSchema)
    .output(listGroupSharesResponseSchema),
};

export type ListsContract = typeof listsContract;
