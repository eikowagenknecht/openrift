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

const listIntentSchema = z.enum(LIST_INTENTS);

const listKindSchema = z.enum(LIST_KINDS);

/** Mirrors the chk_lists_intent_kind DB constraint. */
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
 * The route layer drops trade defaults for `organize` lists; the DB CHECK
 * constraint also rejects non-null values there.
 */
export const createListSchema = z
  .object({
    name: z.string().min(1).max(200),
    intent: listIntentSchema,
    kind: listKindSchema,
    tradeDefaults: tradePreferenceInputSchema.optional(),
    currency: currencySchema.nullable().optional(),
    rules: listRulesSchema.optional(),
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
  sidebarHidden: z.boolean().optional(),
  tradeDefaults: tradePreferenceInputSchema.optional(),
  currency: currencySchema.nullable().optional(),
  rules: listRulesSchema.optional(),
  ruleCombine: listRuleCombineSchema.nullable().optional(),
});

/** Server renumbers sort_order to match orderedIds, scoped to one intent bucket. */
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

export const bulkAddCopiesToListSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
});

/**
 * Destination list must match the source's kind and intent: a different kind
 * would reshape every entry, a different intent would silently repurpose them.
 */
export const moveListEntriesSchema = z.object({
  toListId: z.uuid(),
  entryIds: z.array(z.uuid()).min(1).max(500),
});

export const bulkDeleteListEntriesSchema = z.object({
  entryIds: z.array(z.uuid()).min(1).max(500),
});

const listResponseShape = {
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
  hasRule: z.boolean(),
  sidebarHidden: z.boolean(),
};

export const listResponseSchema = z.object(listResponseShape).openapi("ListResponse");

export const listDetailListResponseSchema = z
  .object({
    ...listResponseShape,
    rules: listRulesSchema,
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
  // shareToken is nullable: GET /share reports an owned-but-unshared list as
  // null; share/rotate always return a non-null token.
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
