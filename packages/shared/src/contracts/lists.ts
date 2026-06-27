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
  listEntryInputShape,
  oneListEntryTarget,
  tradePreferenceInputSchema,
  withParams,
} from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

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
      z.object(listEntryInputShape).refine(oneListEntryTarget, {
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

export const listEntryResponseSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...listEntryBaseShape, kind: z.literal("card"), cardId: z.string() }),
    z.object({ ...listEntryBaseShape, kind: z.literal("printing"), printingId: z.string() }),
    z.object({ ...listEntryBaseShape, kind: z.literal("copy"), copyId: z.string() }),
  ])
  .openapi("ListEntryResponse");

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
