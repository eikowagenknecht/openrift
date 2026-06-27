import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  currencyResponseSchema,
  listEntryBaseShape,
  listEntryDetailResponseSchema,
  listIntentResponseSchema,
  listKindResponseSchema,
  tradePreferenceSchema,
} from "@openrift/shared/response-schemas";
import {
  currencySchema,
  idParamSchema,
  listEntryFieldRules,
  listEntryTargetShape,
  oneListEntryTarget,
  tradePreferenceInputSchema,
  withParams,
} from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const listIntentSchema = z.enum(["wish", "trade", "organize"]);

const listKindSchema = z.enum(["card", "printing", "copy"]);

/**
 * Allowed intent × kind combos. Mirrors the chk_lists_intent_kind DB
 * constraint (migration 133, renamed in 135).
 * @returns true if the combo is allowed.
 */
const isAllowedIntentKind = (
  intent: "wish" | "trade" | "organize",
  kind: "card" | "printing" | "copy",
): boolean => {
  if (intent === "wish") {
    return kind === "card" || kind === "printing";
  }
  if (intent === "trade") {
    return kind === "copy";
  }
  return true;
};

export const idAndItemIdParamSchema = z.object({ id: z.uuid(), itemId: z.uuid() });

export const listIntentQuerySchema = z.object({
  intent: listIntentSchema.optional(),
});

/**
 * `organize` lists never carry trade defaults. The route layer drops these
 * fields when intent === 'organize'; the schema lets clients pass them but the
 * CHECK constraint on the DB also rejects non-null values there.
 */
export const createListSchema = z
  .object({
    // Client-generated list id (ADR-027 step 2): the synced client mints the
    // row's uuid so the optimistic row and the replicated row are the same row.
    // Required — letting the server assign a fallback id would silently diverge
    // the optimistic overlay from the row that comes back on the Electric stream.
    id: z.uuid(),
    name: z.string().min(1).max(200),
    intent: listIntentSchema,
    kind: listKindSchema,
    tradeDefaults: tradePreferenceInputSchema.optional(),
    currency: currencySchema.nullable().optional(),
  })
  .refine((data) => isAllowedIntentKind(data.intent, data.kind), {
    message:
      "Disallowed intent/kind combo. Wish: card|printing. Trade: copy. Organize: card|printing|copy.",
  })
  .refine(
    (data) =>
      data.intent !== "organize" ||
      ((data.tradeDefaults === undefined ||
        (data.tradeDefaults.pricePref === null && data.tradeDefaults.tradeType === null)) &&
        (data.currency === undefined || data.currency === null)),
    { message: "organize lists cannot carry trade defaults or a currency" },
  );

export const updateListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tradeDefaults: tradePreferenceInputSchema.optional(),
  currency: currencySchema.nullable().optional(),
});

/**
 * Bulk reorder for the user's lists in a single intent bucket. The server
 * re-numbers `sort_order` so the rows appear in the order given on the next
 * fetch. Sidebar groups lists by intent, so reorder is bucket-scoped.
 */
export const reorderListsSchema = z.object({
  intent: listIntentSchema,
  orderedIds: z.array(z.uuid()).min(1).max(500),
});

export const updateListEntrySchema = z.object({
  quantity: listEntryFieldRules.quantity.optional(),
  tradeOverride: tradePreferenceInputSchema.optional(),
});

export const bulkCreateListEntriesSchema = z.object({
  entries: z
    .array(
      // Bulk-add requires the entry id: the synced client mints it so the
      // optimistic row and the replicated row are the same row, and a replayed
      // insert is a no-op (the upsert skips a conflict row already carrying the
      // same id).
      z.object({ id: z.uuid(), ...listEntryTargetShape }).refine(oneListEntryTarget, {
        message: "Exactly one of cardId, printingId, or copyId must be provided",
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Drag-from-collections sugar. The user picks copies and drops them on a list
 * in the sidebar; the server derives the right entry shape based on the
 * list's kind (card / printing / copy) and bulk-inserts the deduped result.
 */
export const bulkAddCopiesToListSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
});

/**
 * Move entries from one list to another. The destination must have the same
 * `kind` and `intent` as the source — different `kind` would reshape every
 * entry, different `intent` would silently re-purpose them.
 */
export const moveListEntriesSchema = z.object({
  toListId: z.uuid(),
  entryIds: z.array(z.uuid()).min(1).max(500),
});

/** Bulk-remove entries from a list. Scoped to the list + owner server-side. */
export const bulkDeleteListEntriesSchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(500),
});

export const listResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    intent: listIntentResponseSchema,
    kind: listKindResponseSchema,
    entryCount: z.number().int().nonnegative(),
    isPublic: z.boolean(),
    shareToken: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tradeDefaults: tradePreferenceSchema,
    currency: currencyResponseSchema.nullable(),
  })
  .openapi("ListResponse");

export const listListResponseSchema = z
  .object({ items: z.array(listResponseSchema) })
  .openapi("ListListResponse");

/**
 * Response body for list create/update: the list plus the Postgres transaction
 * id of the write, so the client can await the change on the Electric stream
 * (ADR-027 step 2). Additive — older clients read the list fields and ignore
 * `txid`.
 */
export const listWriteResponseSchema = listResponseSchema
  .extend({ txid: z.number().int() })
  .openapi("ListWriteResponse");

/**
 * Response body for list mutations that previously returned 204 (delete,
 * reorder, entry delete, bulk entry delete): the Postgres transaction id of the
 * change, so the client can await it on the Electric stream (ADR-027 step 2).
 */
export const listMutationResponseSchema = z
  .object({ txid: z.number().int() })
  .openapi("ListMutationResponse");

export const listEntryResponseSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...listEntryBaseShape, kind: z.literal("card"), cardId: z.string() }),
    z.object({ ...listEntryBaseShape, kind: z.literal("printing"), printingId: z.string() }),
    z.object({ ...listEntryBaseShape, kind: z.literal("copy"), copyId: z.string() }),
  ])
  .openapi("ListEntryResponse");

/**
 * Entry create/update response: the entry plus the Postgres transaction id of
 * the write (ADR-027 step 2). A separate union (rather than `.extend`) because
 * zod discriminated unions cannot be extended in place.
 */
export const listEntryWriteResponseSchema = z
  .discriminatedUnion("kind", [
    z.object({
      ...listEntryBaseShape,
      kind: z.literal("card"),
      cardId: z.string(),
      txid: z.number().int(),
    }),
    z.object({
      ...listEntryBaseShape,
      kind: z.literal("printing"),
      printingId: z.string(),
      txid: z.number().int(),
    }),
    z.object({
      ...listEntryBaseShape,
      kind: z.literal("copy"),
      copyId: z.string(),
      txid: z.number().int(),
    }),
  ])
  .openapi("ListEntryWriteResponse");

export const listDetailResponseSchema = z
  .object({
    list: listResponseSchema,
    entries: z.array(listEntryDetailResponseSchema),
  })
  .openapi("ListDetailResponse");

export const listShareResponseSchema = z
  // shareToken is nullable so GET /lists/{id}/share can report an owned-but-
  // unshared list (shareToken: null, isPublic: false) without 404-ing. Share /
  // rotate always return a non-null token.
  .object({ shareToken: z.string().nullable(), isPublic: z.boolean() })
  .openapi("ListShareResponse");

export const listBulkAddResponseSchema = z
  .object({
    added: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  })
  .openapi("ListBulkAddResponse");

/**
 * Bulk-add response with the Postgres transaction id of the upsert, so the
 * synced client can await the change on the Electric stream (ADR-027 step 2).
 */
export const listBulkAddWriteResponseSchema = listBulkAddResponseSchema
  .extend({ txid: z.number().int() })
  .openapi("ListBulkAddWriteResponse");

export const listMoveResponseSchema = z
  .object({
    moved: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
  })
  .openapi("ListMoveResponse");

export const listGroupSharesResponseSchema = z
  .object({
    items: z.array(
      z.object({
        groupId: z.string(),
        groupSlug: z.string(),
        groupName: z.string(),
      }),
    ),
  })
  .openapi("ListGroupSharesResponse");

const TAG = "Lists";

/**
 * oRPC contract for the authenticated unified-lists endpoints (wishlist /
 * tradelist / organize; ADR-017), mounted at `/api/v1/lists`. All require a
 * session, so they share the `authedRoute` base (UNAUTHORIZED + FORBIDDEN).
 * Domain codes per route: `get`, `remove`, `bulkAddFromCopies`,
 * `bulkDeleteEntries`, `getShare`, `share`, `rotateShare`, `unshare`,
 * `groupShares` → NOT_FOUND; `update` → NOT_FOUND + BAD_REQUEST (no fields);
 * `createEntry` → NOT_FOUND + BAD_REQUEST (kind mismatch) + CONFLICT
 * (duplicate); `bulkCreateEntries` → NOT_FOUND + BAD_REQUEST (kind mismatch);
 * `moveEntries` → NOT_FOUND + BAD_REQUEST (incompatible lists);
 * `updateEntry` → NOT_FOUND + BAD_REQUEST (no fields); `removeEntry` →
 * NOT_FOUND.
 */
export const listsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/lists", tags: [TAG] })
    .input(listIntentQuerySchema)
    .output(listListResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/lists", tags: [TAG], successStatus: 201 })
    .input(createListSchema)
    .errors({ CONFLICT: { message: "List already exists" } })
    .output(listWriteResponseSchema),
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/lists/{id}", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "List not found" } })
    .output(listDetailResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: "/api/v1/lists/{id}", tags: [TAG] })
    .input(withParams(idParamSchema, updateListSchema))
    .errors({
      NOT_FOUND: { message: "List not found" },
      BAD_REQUEST: { message: "No fields to update" },
    })
    .output(listWriteResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: "/api/v1/lists/{id}", tags: [TAG] })
    .errors({ NOT_FOUND: { message: "List not found" } })
    .input(idParamSchema)
    .output(listMutationResponseSchema),
  // Single-add: `{id}` is the list (path param); the entry id is generated
  // server-side. The body carries only the shared target fields — no entry id,
  // so it can't collide with the list path param. The synced client adds via
  // `bulkCreateEntries`, which requires a client-minted per-entry id.
  createEntry: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries", tags: [TAG], successStatus: 201 })
    .input(withParams(idParamSchema, listEntryTargetShape))
    .errors({
      NOT_FOUND: { message: "List or copy not found" },
      BAD_REQUEST: { message: "Entry target does not match list kind" },
      CONFLICT: { message: "That item is already in the list" },
    })
    .output(listEntryWriteResponseSchema),
  bulkCreateEntries: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries/bulk", tags: [TAG] })
    .input(withParams(idParamSchema, bulkCreateListEntriesSchema))
    .errors({
      NOT_FOUND: { message: "List not found" },
      BAD_REQUEST: { message: "Entry target does not match list kind" },
    })
    .output(listBulkAddWriteResponseSchema),
  bulkAddFromCopies: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries/from-copies", tags: [TAG] })
    .input(withParams(idParamSchema, bulkAddCopiesToListSchema))
    .errors({ NOT_FOUND: { message: "List not found" } })
    .output(listBulkAddResponseSchema),
  moveEntries: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries/move", tags: [TAG] })
    .input(withParams(idParamSchema, moveListEntriesSchema))
    .errors({
      NOT_FOUND: { message: "List not found" },
      BAD_REQUEST: { message: "Source and destination lists are incompatible" },
    })
    .output(listMoveResponseSchema),
  updateEntry: authedRoute
    .route({ method: "PATCH", path: "/api/v1/lists/{id}/entries/{itemId}", tags: [TAG] })
    .input(withParams(idAndItemIdParamSchema, updateListEntrySchema))
    .errors({
      NOT_FOUND: { message: "Entry not found" },
      BAD_REQUEST: { message: "No fields to update" },
    })
    .output(listEntryWriteResponseSchema),
  removeEntry: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/lists/{id}/entries/{itemId}",
      tags: [TAG],
    })
    .errors({ NOT_FOUND: { message: "Entry not found" } })
    .input(idAndItemIdParamSchema)
    .output(listMutationResponseSchema),
  bulkDeleteEntries: authedRoute
    .route({
      method: "POST",
      path: "/api/v1/lists/{id}/entries/bulk-delete",
      tags: [TAG],
    })
    .errors({ NOT_FOUND: { message: "List not found" } })
    .input(withParams(idParamSchema, bulkDeleteListEntriesSchema))
    .output(listMutationResponseSchema),
  getShare: authedRoute
    .route({ method: "GET", path: "/api/v1/lists/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "List not found" } })
    .output(listShareResponseSchema),
  share: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/share", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "List not found" } })
    .output(listShareResponseSchema),
  rotateShare: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/share/rotate", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "List not found" } })
    .output(listShareResponseSchema),
  unshare: authedRoute
    .route({ method: "DELETE", path: "/api/v1/lists/{id}/share", tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "List not found" } })
    .input(idParamSchema),
  reorder: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/reorder", tags: [TAG] })
    .input(reorderListsSchema)
    .output(listMutationResponseSchema),
  groupShares: authedRoute
    .route({ method: "GET", path: "/api/v1/lists/{id}/group-shares", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "List not found" } })
    .output(listGroupSharesResponseSchema),
};

export type ListsContract = typeof listsContract;
