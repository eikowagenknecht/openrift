import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  currencyResponseSchema,
  listEntryBaseShape,
  listEntryDetailResponseSchema,
  LIST_INTENTS,
  LIST_KINDS,
  listIntentResponseSchema,
  listKindResponseSchema,
  tradePreferenceSchema,
} from "@openrift/shared/response-schemas";
import {
  currencySchema,
  idParamSchema,
  listEntryFieldRules,
  listEntryInputShape,
  listRuleCombineSchema,
  listRulesSchema,
  oneListEntryTarget,
  ruleCombineMatchesKind,
  ruleKindForListKind,
  tradePreferenceInputSchema,
  withParams,
} from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

// Request-side enums. Built from the shared value arrays rather than aliased to
// the response schemas so the `.openapi()` component names stay on the response
// side (see LIST_INTENTS in response-schemas.ts).
const listIntentSchema = z.enum(LIST_INTENTS);

const listKindSchema = z.enum(LIST_KINDS);

/**
 * Allowed intent × kind combos. Mirrors the chk_lists_intent_kind DB
 * constraint (migration 133, renamed in 135).
 * @returns true if the combo is allowed.
 */
const isAllowedIntentKind = (
  intent: (typeof LIST_INTENTS)[number],
  kind: (typeof LIST_KINDS)[number],
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
    // Dynamic list rules (ADR-034). Valid on every intent; each rule's
    // discriminant must match the list kind (see refinements below).
    rules: listRulesSchema.optional(),
    // How several rules combine (ADR-034 amendment 2). null/absent = the
    // kind's default (card/printing: sum, copy: protect).
    ruleCombine: listRuleCombineSchema.nullable().optional(),
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
  )
  // ADR-034 amendment 4: a rule's shape follows the list's kind, not its
  // intent — card/printing lists take demand rules, copy lists supply rules —
  // so organize lists carry rules too.
  .refine(
    (data) => (data.rules ?? []).every((rule) => rule.kind === ruleKindForListKind(data.kind)),
    { message: "rule kind must match the list kind" },
  )
  .refine(
    (data) =>
      data.ruleCombine === null ||
      data.ruleCombine === undefined ||
      ruleCombineMatchesKind(data.ruleCombine, data.kind),
    { message: "rule combine mode must match the list kind" },
  );

export const updateListSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tradeDefaults: tradePreferenceInputSchema.optional(),
  currency: currencySchema.nullable().optional(),
  // Set/replace the dynamic rules (ADR-034). An empty array clears them. The
  // route layer validates each rule's kind against the existing list's kind.
  rules: listRulesSchema.optional(),
  // Set/clear the combine mode (ADR-034 amendment 2). null = back to the
  // kind's default. The route layer validates the mode against the kind.
  ruleCombine: listRuleCombineSchema.nullable().optional(),
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

const listResponseShape = {
  id: z.string(),
  name: z.string(),
  intent: listIntentResponseSchema,
  kind: listKindResponseSchema,
  // Manual entry count only (rule output is NOT expanded on summaries; ADR-034).
  entryCount: z.number().int().nonnegative(),
  isPublic: z.boolean(),
  shareToken: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tradeDefaults: tradePreferenceSchema,
  currency: currencyResponseSchema.nullable(),
  // Whether this list carries a dynamic rule (ADR-034).
  hasRule: z.boolean(),
};

export const listResponseSchema = z.object(listResponseShape).openapi("ListResponse");

/** Detail responses also carry the rules themselves so the editor can load them. */
export const listDetailListResponseSchema = z
  .object({
    ...listResponseShape,
    rules: listRulesSchema,
    // null = the intent's default combine mode (ADR-034 amendment 2).
    ruleCombine: listRuleCombineSchema.nullable(),
  })
  .openapi("ListDetailListResponse");

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
    list: listDetailListResponseSchema,
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
    .output(listResponseSchema),
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
    .output(listResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: "/api/v1/lists/{id}", tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "List not found" } })
    .input(idParamSchema),
  createEntry: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries", tags: [TAG], successStatus: 201 })
    .input(withParams(idParamSchema, listEntryInputShape))
    .errors({
      NOT_FOUND: { message: "List or copy not found" },
      BAD_REQUEST: { message: "Entry target does not match list kind" },
      CONFLICT: { message: "That item is already in the list" },
    })
    .output(listEntryResponseSchema),
  bulkCreateEntries: authedRoute
    .route({ method: "POST", path: "/api/v1/lists/{id}/entries/bulk", tags: [TAG] })
    .input(withParams(idParamSchema, bulkCreateListEntriesSchema))
    .errors({
      NOT_FOUND: { message: "List not found" },
      BAD_REQUEST: { message: "Entry target does not match list kind" },
    })
    .output(listBulkAddResponseSchema),
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
    .output(listEntryResponseSchema),
  removeEntry: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/lists/{id}/entries/{itemId}",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Entry not found" } })
    .input(idAndItemIdParamSchema),
  bulkDeleteEntries: authedRoute
    .route({
      method: "POST",
      path: "/api/v1/lists/{id}/entries/bulk-delete",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "List not found" } })
    .input(withParams(idParamSchema, bulkDeleteListEntriesSchema)),
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
    .route({ method: "POST", path: "/api/v1/lists/reorder", tags: [TAG], successStatus: 204 })
    .input(reorderListsSchema),
  groupShares: authedRoute
    .route({ method: "GET", path: "/api/v1/lists/{id}/group-shares", tags: [TAG] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "List not found" } })
    .output(listGroupSharesResponseSchema),
};

export type ListsContract = typeof listsContract;
