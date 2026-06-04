import { createRoute, z } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import type {
  ListBulkAddResponse,
  ListDetailResponse,
  ListKind,
  ListListResponse,
  ListShareResponse,
} from "@openrift/shared";
import {
  listBulkAddResponseSchema,
  listDetailResponseSchema,
  listEntryResponseSchema,
  listGroupSharesResponseSchema,
  listListResponseSchema,
  listMoveResponseSchema,
  listResponseSchema,
  listShareResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  bulkAddCopiesToListSchema,
  bulkCreateListEntriesSchema,
  createListEntrySchema,
  createListSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  listIntentQuerySchema,
  moveListEntriesSchema,
  reorderListsSchema,
  updateListEntrySchema,
  updateListSchema,
} from "@openrift/shared/schemas";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createApiApp } from "../../openapi.js";
import type { ListEntryUpdate, ListUpdate, NewEntryValues } from "../../repositories/lists.js";
import { assertDeleted, assertFound } from "../../utils/assertions.js";
import { toList, toListEntry, toListEntryDetail } from "../../utils/mappers.js";
import { generateShareToken } from "../../utils/share-token.js";

const listLists = createRoute({
  method: "get",
  path: "/",
  tags: ["Lists"],
  request: { query: listIntentQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: listListResponseSchema } },
      description: "Success",
    },
  },
});

const createList = createRoute({
  method: "post",
  path: "/",
  tags: ["Lists"],
  request: {
    body: { content: { "application/json": { schema: createListSchema } } },
  },
  responses: {
    201: {
      headers: z.object({
        Location: z.string().openapi({ description: "URL of the created list" }),
      }),
      content: { "application/json": { schema: listResponseSchema } },
      description: "Created",
    },
  },
});

const getList = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Lists"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: listDetailResponseSchema } },
      description: "Success",
    },
  },
});

const updateList = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateListSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: listResponseSchema } },
      description: "Success",
    },
  },
});

const deleteList = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Lists"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const createListEntryRoute = createRoute({
  method: "post",
  path: "/{id}/entries",
  tags: ["Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: createListEntrySchema } } },
  },
  responses: {
    201: {
      headers: z.object({
        Location: z.string().openapi({ description: "URL of the list with the created entry" }),
      }),
      content: { "application/json": { schema: listEntryResponseSchema } },
      description: "Created",
    },
  },
});

const bulkCreateListEntriesRoute = createRoute({
  method: "post",
  path: "/{id}/entries/bulk",
  tags: ["Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: bulkCreateListEntriesSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: listBulkAddResponseSchema } },
      description: "Success",
    },
  },
});

const bulkAddCopiesToListRoute = createRoute({
  method: "post",
  path: "/{id}/entries/from-copies",
  tags: ["Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: bulkAddCopiesToListSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: listBulkAddResponseSchema } },
      description: "Success",
    },
  },
});

const moveListEntriesRoute = createRoute({
  method: "post",
  path: "/{id}/entries/move",
  tags: ["Lists"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: moveListEntriesSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: listMoveResponseSchema } },
      description: "Success",
    },
  },
});

const updateListEntryRoute = createRoute({
  method: "patch",
  path: "/{id}/entries/{itemId}",
  tags: ["Lists"],
  request: {
    params: idAndItemIdParamSchema,
    body: { content: { "application/json": { schema: updateListEntrySchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: listEntryResponseSchema } },
      description: "Success",
    },
  },
});

const deleteListEntry = createRoute({
  method: "delete",
  path: "/{id}/entries/{itemId}",
  tags: ["Lists"],
  request: { params: idAndItemIdParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const getShareState = createRoute({
  method: "get",
  path: "/{id}/share",
  tags: ["Lists"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: listShareResponseSchema } },
      description: "Current share state (shareToken null + isPublic false if unshared)",
    },
  },
});

const shareList = createRoute({
  method: "post",
  path: "/{id}/share",
  tags: ["Lists"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: listShareResponseSchema } },
      description: "Shared (idempotent — returns the existing token if already shared)",
    },
  },
});

const rotateShareList = createRoute({
  method: "post",
  path: "/{id}/share/rotate",
  tags: ["Lists"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: listShareResponseSchema } },
      description: "Share token rotated (old token stops resolving)",
    },
  },
});

const unshareList = createRoute({
  method: "delete",
  path: "/{id}/share",
  tags: ["Lists"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const reorderLists = createRoute({
  method: "post",
  path: "/reorder",
  tags: ["Lists"],
  request: {
    body: { content: { "application/json": { schema: reorderListsSchema } } },
  },
  responses: {
    204: { description: "No Content" },
  },
});

const listGroupShares = createRoute({
  method: "get",
  path: "/{id}/group-shares",
  tags: ["Lists"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: listGroupSharesResponseSchema } },
      description: "Groups this list is shared with (ADR-013)",
    },
  },
});

const listsApp = createApiApp().basePath("/lists");
listsApp.use(requireAuth);
export const listsRoute = listsApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listLists, async (c) => {
    const { lists } = c.get("repos");
    const { intent } = c.req.valid("query");
    const rows = await lists.listForUser(getUserId(c), intent);
    return c.json({
      items: rows.map((row) => toList(row)),
    } satisfies ListListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .openapi(createList, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    // ADR-017: trade defaults only apply to wish/trade lists. The DB CHECK
    // constraint rejects non-null prefs on organize lists; we strip here so
    // the API never round-trips a 500.
    const supportsPrefs = body.intent !== "organize";
    const tradeDefaults = supportsPrefs ? body.tradeDefaults : undefined;
    const row = await lists.create({
      userId,
      name: body.name,
      intent: body.intent,
      kind: body.kind,
      defaultPricePref: tradeDefaults?.pricePref ?? null,
      defaultPriceAbsoluteCents: tradeDefaults?.priceAbsoluteCents ?? null,
      defaultTradeType: tradeDefaults?.tradeType ?? null,
      currency: supportsPrefs ? (body.currency ?? null) : null,
    });
    c.header("Location", `/api/v1/lists/${row.id}`);
    return c.json(toList(row), 201);
  })

  // ── GET ONE (with enriched entries) ─────────────────────────────────────────
  .openapi(getList, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const list = await lists.getByIdForUser(id, userId);
    assertFound(list, "Not found");

    const entries = await lists.entriesWithDetails(id, list.kind, userId);

    const detail: ListDetailResponse = {
      list: toList(list),
      entries: entries.map((row) => toListEntryDetail(row)),
    };
    return c.json(detail);
  })

  // ── UPDATE (name + trade prefs; intent/kind immutable post-creation) ───────
  .openapi(updateList, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    // Build updates manually so a tradeDefaults- or currency-only patch
    // doesn't trip the generic patch helper's "no fields" guard. (Same
    // pattern as the entry PATCH handler.)
    const updates: ListUpdate = {};
    if (body.name !== undefined) {
      updates.name = body.name;
    }
    if (body.tradeDefaults !== undefined) {
      updates.defaultPricePref = body.tradeDefaults.pricePref;
      updates.defaultPriceAbsoluteCents = body.tradeDefaults.priceAbsoluteCents;
      updates.defaultTradeType = body.tradeDefaults.tradeType;
    }
    if (body.currency !== undefined) {
      updates.currency = body.currency;
    }
    if (Object.keys(updates).length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No fields to update");
    }
    const row = await lists.update(id, userId, updates);
    assertFound(row, "Not found");
    return c.json(toList(row));
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  .openapi(deleteList, async (c) => {
    const { lists } = c.get("repos");
    const { id } = c.req.valid("param");
    const result = await lists.deleteByIdForUser(id, getUserId(c));
    assertDeleted(result, "Not found");
    return c.body(null, 204);
  })

  // ── POST /lists/:id/entries ───────────────────────────────────────────────
  .openapi(createListEntryRoute, async (c) => {
    const { lists, copies } = c.get("repos");
    const userId = getUserId(c);
    const { id: listId } = c.req.valid("param");
    const body = c.req.valid("json");

    const list = await lists.getIdAndKind(listId, userId);
    assertFound(list, "List not found");

    const target = await resolveEntryTarget(list.kind, body, userId, copies);

    const row = await lists.createEntry({
      listId,
      userId,
      kind: list.kind,
      cardId: target.cardId,
      printingId: target.printingId,
      copyId: target.copyId,
      quantity: body.quantity,
      pricePref: body.tradeOverride.pricePref,
      priceAbsoluteCents: body.tradeOverride.priceAbsoluteCents,
      tradeType: body.tradeOverride.tradeType,
    });

    // List entries have no standalone GET; point at the owning list.
    c.header("Location", `/api/v1/lists/${listId}`);
    return c.json(toListEntry(row), 201);
  })

  // ── POST /lists/:id/entries/bulk ──────────────────────────────────────────
  .openapi(bulkCreateListEntriesRoute, async (c) => {
    const { lists, copies } = c.get("repos");
    const userId = getUserId(c);
    const { id: listId } = c.req.valid("param");
    const { entries } = c.req.valid("json");

    const list = await lists.getIdAndKind(listId, userId);
    assertFound(list, "List not found");

    // Reject the whole batch if any entry's target column doesn't match the
    // list's kind — the partial-index ON CONFLICT (and the FK) would fail on
    // a mismatch anyway. A clean 400 here avoids a confusing DB-level error.
    for (const entry of entries) {
      if (!targetMatchesKind(list.kind, entry)) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          `Every entry must target the list's kind (${list.kind})`,
        );
      }
    }

    // Copy-kind lists: filter to copies the user can access (their personal
    // collections plus shared group collections); drop the rest silently
    // rather than 400-ing the whole batch. Card/printing kinds pass through
    // (FK enforces target row existence).
    let usableEntries = entries;
    if (list.kind === "copy") {
      const copyIdsRequested = entries
        .map((entry) => entry.copyId)
        .filter((id): id is string => id !== undefined);
      const accessibleCopyIds = new Set(
        copyIdsRequested.length > 0
          ? await copies.filterAccessibleByViewer(copyIdsRequested, userId)
          : [],
      );
      usableEntries = entries.filter(
        (entry) => entry.copyId !== undefined && accessibleCopyIds.has(entry.copyId),
      );
    }

    const usable: NewEntryValues[] = usableEntries.map((entry) => ({
      listId,
      userId,
      kind: list.kind,
      cardId: entry.cardId ?? null,
      printingId: entry.printingId ?? null,
      copyId: entry.copyId ?? null,
      quantity: entry.quantity,
      pricePref: entry.tradeOverride.pricePref,
      priceAbsoluteCents: entry.tradeOverride.priceAbsoluteCents,
      tradeType: entry.tradeOverride.tradeType,
    }));

    const result = await lists.bulkCreateEntries(list.kind, usable);

    // `skipped` captures both the ownership filter (copy-kind only) and any
    // copy-kind dupes that took the DO NOTHING branch. Card/printing-kind
    // dupes merge into existing rows via quantity bump and surface as
    // `updated`, not `skipped`.
    const response: ListBulkAddResponse = {
      added: result.inserted,
      updated: result.updated,
      skipped: entries.length - result.inserted - result.updated,
    };
    return c.json(response);
  })

  // ── POST /lists/:id/entries/from-copies ──────────────────────────────────
  // Drag-from-collections sugar. Front-end passes copy IDs from a drag; the
  // repo derives the right target shape based on the list's kind:
  //   kind = copy     → one entry per owned copy
  //   kind = printing → one entry per distinct printing across the copies
  //   kind = card     → one entry per distinct card across the copies
  // Non-owned copies and existing duplicates are skipped silently and
  // reflected in `skipped`.
  .openapi(bulkAddCopiesToListRoute, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id: listId } = c.req.valid("param");
    const { copyIds } = c.req.valid("json");

    const list = await lists.getIdAndKind(listId, userId);
    assertFound(list, "List not found");

    const result = await lists.bulkCreateEntriesFromCopies(listId, list.kind, userId, copyIds);

    return c.json(result satisfies ListBulkAddResponse);
  })

  // ── POST /lists/:id/entries/move ─────────────────────────────────────────
  // Move entries from this list (the {id} in the path) to another list owned
  // by the same user. The destination must match the source on kind + intent
  // — different kind would reshape every entry, different intent would
  // silently re-purpose them (turning a wishlist into a tradelist row).
  .openapi(moveListEntriesRoute, async (c) => {
    const { moveListEntries } = c.get("services");
    const repos = c.get("repos");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const { id: fromListId } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await moveListEntries(
      repos,
      transact,
      userId,
      fromListId,
      body.toListId,
      body.entryIds,
    );
    return c.json(result);
  })

  // ── PATCH /lists/:id/entries/:itemId ──────────────────────────────────────
  .openapi(updateListEntryRoute, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id: listId, itemId } = c.req.valid("param");
    const body = c.req.valid("json");
    // Build the updates manually so we can mix two field categories
    // (scalar `quantity` and the nested `tradeOverride` triple) without the
    // generic patch helper rejecting a tradeOverride-only patch as empty.
    const updates: ListEntryUpdate = {};
    if (body.quantity !== undefined) {
      updates.quantity = body.quantity;
    }
    if (body.tradeOverride !== undefined) {
      updates.pricePref = body.tradeOverride.pricePref;
      updates.priceAbsoluteCents = body.tradeOverride.priceAbsoluteCents;
      updates.tradeType = body.tradeOverride.tradeType;
    }
    if (Object.keys(updates).length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No fields to update");
    }
    const row = await lists.updateEntry(itemId, listId, userId, updates);
    assertFound(row, "Not found");
    return c.json(toListEntry(row));
  })

  // ── DELETE /lists/:id/entries/:itemId ─────────────────────────────────────
  .openapi(deleteListEntry, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id: listId, itemId } = c.req.valid("param");

    const result = await lists.deleteEntry(itemId, listId, userId);
    assertDeleted(result, "Not found");

    return c.body(null, 204);
  })

  // ── GET /lists/:id/share ──────────────────────────────────────────────────
  // Owner-only. Reports the current share state. An owned-but-unshared list
  // resolves to { shareToken: null, isPublic: false } rather than 404 — 404 is
  // reserved for lists the caller doesn't own.
  .openapi(getShareState, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const state = await lists.getShareState(id, userId);
    assertFound(state, "Not found");

    return c.json(state satisfies ListShareResponse);
  })

  // ── POST /lists/:id/share ─────────────────────────────────────────────────
  // Idempotent enable: if the list already has a token, return the existing
  // share state unchanged (no token churn). Otherwise mint a token and flip
  // is_public=true. Token rotation lives in the dedicated /share/rotate route.
  .openapi(shareList, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const current = await lists.getShareState(id, userId);
    assertFound(current, "Not found");
    if (current.shareToken !== null) {
      return c.json(current satisfies ListShareResponse);
    }

    const token = generateShareToken();
    const updated = await lists.setShareToken(id, userId, token, true);
    assertFound(updated, "Not found");

    return c.json({ shareToken: token, isPublic: true } satisfies ListShareResponse);
  })

  // ── POST /lists/:id/share/rotate ──────────────────────────────────────────
  // Owner-only. Mints a NEW token (the previous URL stops resolving) and
  // ensures is_public=true. Treats rotate-while-unshared as "share now" rather
  // than 409 — setShareToken supports it cleanly, so a client that rotates
  // before sharing just ends up shared, matching the bundle-share precedent.
  .openapi(rotateShareList, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const token = generateShareToken();
    const updated = await lists.setShareToken(id, userId, token, true);
    assertFound(updated, "Not found");

    return c.json({ shareToken: token, isPublic: true } satisfies ListShareResponse);
  })

  // ── DELETE /lists/:id/share ───────────────────────────────────────────────
  // Nulls the share token and sets is_public=false. Old links 404 forever.
  .openapi(unshareList, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const updated = await lists.setShareToken(id, userId, null, false);
    assertFound(updated, "Not found");

    return c.body(null, 204);
  })

  // ── GET /lists/:id/group-shares (ADR-013) ─────────────────────────────────
  // The "shared with N groups" badge on the list page. Scoped to lists the
  // viewer owns; non-owned lists 404.
  .openapi(listGroupShares, async (c) => {
    const { lists, friendGroups } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const list = await lists.getByIdForUser(id, userId);
    assertFound(list, "List not found");

    const items = await friendGroups.listGroupsSharingList(id);
    return c.json({ items });
  })

  // ── POST /lists/reorder ───────────────────────────────────────────────────
  // Bulk reorder for the user's lists in a single intent bucket. Lists in
  // other intents are silently ignored so the client only needs to send the
  // current bucket's view.
  .openapi(reorderLists, async (c) => {
    const { lists } = c.get("repos");
    const userId = getUserId(c);
    const { intent, orderedIds } = c.req.valid("json");
    await lists.reorder(userId, intent, orderedIds);
    return c.body(null, 204);
  });

/**
 * Validates that the body's target matches the list's kind, and pre-checks
 * copy ownership for kind = 'copy' so the route returns a clean 404 instead
 * of leaking the composite-FK error from the DB.
 * @returns The normalized triple with two nulls and one ID matching `kind`.
 */
async function resolveEntryTarget(
  kind: ListKind,
  body: { cardId?: string; printingId?: string; copyId?: string },
  userId: string,
  copies: { existsForViewer: (id: string, userId: string) => Promise<unknown> },
): Promise<{ cardId: string | null; printingId: string | null; copyId: string | null }> {
  if (!targetMatchesKind(kind, body)) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `Entry target must match the list's kind (${kind})`,
    );
  }
  if (kind === "card") {
    return { cardId: body.cardId ?? null, printingId: null, copyId: null };
  }
  if (kind === "printing") {
    return { cardId: null, printingId: body.printingId ?? null, copyId: null };
  }
  // kind === "copy"
  const copyId = body.copyId;
  if (copyId !== undefined) {
    const accessible = await copies.existsForViewer(copyId, userId);
    assertFound(accessible, "Copy not found");
  }
  return { cardId: null, printingId: null, copyId: copyId ?? null };
}

/**
 * @returns Whether the body's single non-null target is the one expected by `kind`.
 */
function targetMatchesKind(
  kind: ListKind,
  body: { cardId?: string; printingId?: string; copyId?: string },
): boolean {
  if (kind === "card") {
    return body.cardId !== undefined && body.printingId === undefined && body.copyId === undefined;
  }
  if (kind === "printing") {
    return body.printingId !== undefined && body.cardId === undefined && body.copyId === undefined;
  }
  return body.copyId !== undefined && body.cardId === undefined && body.printingId === undefined;
}
