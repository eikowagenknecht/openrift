import { createRoute } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import type { CollectionListResponse, CopyListResponse } from "@openrift/shared";
import {
  collectionGroupSharesResponseSchema,
  collectionListResponseSchema,
  collectionResponseSchema,
  collectionShareResponseSchema,
  copyListResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  copiesQuerySchema,
  createCollectionSchema,
  idParamSchema,
  reorderCollectionsSchema,
  setCollectionDeckbuildingSchema,
  updateCollectionSchema,
} from "@openrift/shared/schemas";
import type { Updateable } from "kysely";

import type { CollectionsTable } from "../../db/index.js";
import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { createApiApp } from "../../openapi.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import { buildCopiesCursor, clampCopiesLimit } from "../../repositories/copies.js";
import { assertFound } from "../../utils/assertions.js";
import { toCollection, toCopy } from "../../utils/mappers.js";
import { getFavoriteMarketplace } from "../../utils/preferences.js";
import { generateShareToken } from "../../utils/share-token.js";

const patchFields: FieldMapping<Updateable<CollectionsTable>> = {
  name: "name",
  description: "description",
  sortOrder: "sortOrder",
};

const listCollections = createRoute({
  method: "get",
  path: "/",
  tags: ["Collections"],
  responses: {
    200: {
      content: { "application/json": { schema: collectionListResponseSchema } },
      description: "Success",
    },
  },
});

const createCollection = createRoute({
  method: "post",
  path: "/",
  tags: ["Collections"],
  request: {
    body: { content: { "application/json": { schema: createCollectionSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: collectionResponseSchema } },
      description: "Created",
    },
  },
});

const getCollection = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Collections"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: collectionResponseSchema } },
      description: "Success",
    },
  },
});

const updateCollection = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Collections"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateCollectionSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: collectionResponseSchema } },
      description: "Success",
    },
  },
});

const deleteCollection = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Collections"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const getCollectionCopies = createRoute({
  method: "get",
  path: "/{id}/copies",
  tags: ["Collections"],
  request: {
    params: idParamSchema,
    query: copiesQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: copyListResponseSchema } },
      description: "Success",
    },
  },
});

const shareCollection = createRoute({
  method: "post",
  path: "/{id}/share",
  tags: ["Collections"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: collectionShareResponseSchema } },
      description: "Shared",
    },
  },
});

const unshareCollection = createRoute({
  method: "delete",
  path: "/{id}/share",
  tags: ["Collections"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "No Content" },
  },
});

const collectionGroupShares = createRoute({
  method: "get",
  path: "/{id}/group-shares",
  tags: ["Collections"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: collectionGroupSharesResponseSchema } },
      description: "Groups this collection is shared with",
    },
  },
});

const reorderCollections = createRoute({
  method: "post",
  path: "/reorder",
  tags: ["Collections"],
  request: {
    body: { content: { "application/json": { schema: reorderCollectionsSchema } } },
  },
  responses: {
    204: { description: "No Content" },
  },
});

const setDeckbuilding = createRoute({
  method: "put",
  path: "/{id}/deckbuilding",
  tags: ["Collections"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: setCollectionDeckbuildingSchema } } },
  },
  responses: {
    204: { description: "No Content" },
  },
});

const collectionsApp = createApiApp().basePath("/collections");
collectionsApp.use(requireAuth);
export const collectionsRoute = collectionsApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listCollections, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const rows = await repos.collections.listAccessibleForUser(userId);
    const values = await repos.marketplace.collectionValues(
      rows.map((row) => row.id),
      favMarketplace,
    );
    return c.json({
      items: rows.map((row) => toCollection(row, values.get(row.id))),
    } satisfies CollectionListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .openapi(createCollection, async (c) => {
    const { collections, collectionDeckbuildingPrefs, friendGroups } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");

    let groupId: string | null = null;
    let groupSlug: string | null = null;
    let groupName: string | null = null;
    if (body.groupSlug) {
      const group = await friendGroups.getBySlug(body.groupSlug);
      assertFound(group, "Group not found");
      const membership = await friendGroups.getMembership(group.id, userId);
      if (!membership) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "You are not a member of this group");
      }
      groupId = group.id;
      groupSlug = group.slug;
      groupName = group.name;
    }

    // Group collections stay alphabetical (`sort_order: 0` falls through to
    // name ordering in `listAccessibleForUser`). Personal collections get
    // appended to the user's list via max+1.
    const sortOrder = groupId ? 0 : await collections.nextPersonalSortOrder(userId);
    const row = await collections.create({
      userId: groupId ? null : userId,
      groupId,
      name: body.name,
      description: body.description ?? null,
      isInbox: false,
      sortOrder,
    });

    // Deck-building availability is now a per-viewer preference, not a column.
    // The type default is "available if it's my own collection" (group_id IS
    // NULL), so a personal collection only needs an explicit row when the
    // creator opts it OUT. Group collections default off and are opted in via
    // the per-member toggle, so we ignore an `available: true` hint here.
    let availableForDeckbuilding = groupId === null;
    if (groupId === null && body.availableForDeckbuilding === false) {
      await collectionDeckbuildingPrefs.set(userId, row.id, false);
      availableForDeckbuilding = false;
    }

    return c.json(
      toCollection({
        ...row,
        availableForDeckbuilding,
        copyCount: 0,
        groupSlug,
        groupName,
        viewerCanAdmin: true,
      }),
      201,
    );
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .openapi(getCollection, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const access = await repos.collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const value = await repos.marketplace.singleCollectionValue(id, favMarketplace);
    return c.json(
      toCollection({ ...access.collection, viewerCanAdmin: access.viewerCanAdmin }, value),
    );
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .openapi(updateCollection, async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can edit this collection");
    }
    const updates = buildPatchUpdates<Updateable<CollectionsTable>>(body, patchFields);
    const row = await collections.updateById(id, updates);
    assertFound(row, "Not found");
    return c.json(
      toCollection({
        ...row,
        // Deck-building availability is per-viewer and untouched by this
        // admin-gated edit; carry over the value resolved during access check.
        availableForDeckbuilding: access.collection.availableForDeckbuilding,
        groupSlug: access.collection.groupSlug,
        groupName: access.collection.groupName,
        viewerCanAdmin: access.viewerCanAdmin,
      }),
    );
  })

  // ── DELETE /collections/:id ─────────────────────────────────────────────────
  // Personal: blocks inbox, moves remaining copies to inbox, then deletes.
  // Shared: requires group admin. There's no group "inbox" — deletion fails if
  // the collection still has copies. The UI surfaces this.
  .openapi(deleteCollection, async (c) => {
    const repos = c.get("repos");
    const transact = c.get("transact");
    const { ensureInbox, deleteCollection: deleteCollectionService } = c.get("services");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const access = await repos.collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can delete this collection");
    }

    const { collection } = access;
    if (collection.isInbox) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete inbox collection");
    }

    if (collection.groupId) {
      const copies = await repos.collections.listCopiesInCollection(id);
      if (copies.length > 0) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "Empty the shared collection before deleting it",
        );
      }
      await repos.collections.deleteById(id);
      return c.body(null, 204);
    }

    const inboxId = await ensureInbox(repos, userId);
    await deleteCollectionService(transact, {
      collectionId: id,
      collectionName: collection.name,
      moveCopiesTo: inboxId,
      targetName: "Inbox",
      userId,
    });

    return c.body(null, 204);
  })

  // ── GET /collections/:id/copies ─────────────────────────────────────────────
  .openapi(getCollectionCopies, async (c) => {
    const { collections, copies } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const { cursor, limit } = c.req.valid("query");

    const access = await collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");

    const effectiveLimit = clampCopiesLimit(limit);
    const rows = await copies.listForCollection(id, effectiveLimit, cursor);
    const hasMore = rows.length > effectiveLimit;
    const items = rows.slice(0, effectiveLimit);
    const lastItem = items.at(-1);

    return c.json({
      items: items.map((row) => toCopy(row)),
      nextCursor: hasMore && lastItem ? buildCopiesCursor(lastItem.createdAt, lastItem.id) : null,
    } satisfies CopyListResponse);
  })

  // ── POST /collections/:id/share ───────────────────────────────────────────
  // Generates (or rotates) the collection's share token and flips is_public=true.
  // Personal owners or group admins only.
  .openapi(shareCollection, async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const access = await collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can share this collection");
    }

    const token = generateShareToken();
    const updated = await collections.setShareTokenById(id, token, true);
    assertFound(updated, "Not found");

    return c.json({ shareToken: token, isPublic: true });
  })

  // ── DELETE /collections/:id/share ─────────────────────────────────────────
  // Nulls the share token and flips is_public=false. Old links 404 forever.
  .openapi(unshareCollection, async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const access = await collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");
    if (!access.viewerCanAdmin) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only admins can unshare this collection");
    }

    const updated = await collections.setShareTokenById(id, null, false);
    assertFound(updated, "Not found");

    return c.body(null, 204);
  })

  // ── GET /collections/:id/group-shares ─────────────────────────────────────
  // "Shared with N groups" badge on the collection page. Scoped to personal
  // collections the viewer owns; non-owned/pooled collections 404.
  .openapi(collectionGroupShares, async (c) => {
    const { collections, friendGroups } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const access = await collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");
    if (access.collection.userId !== userId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Collection not found");
    }

    const items = await friendGroups.groupsSharingCollection(id);
    return c.json({ items });
  })

  // ── POST /collections/reorder ─────────────────────────────────────────────
  // Bulk reorder for the user's personal collections. Group-owned rows are
  // silently ignored (they stay alphabetical) so the client can pass any
  // visible-order subset without filtering first.
  .openapi(reorderCollections, async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const { orderedIds } = c.req.valid("json");
    await collections.reorderPersonal(userId, orderedIds);
    return c.body(null, 204);
  })

  // ── PUT /collections/:id/deckbuilding ──────────────────────────────────────
  // Sets the *caller's own* deck-building availability for a collection. This
  // is a per-viewer preference, so any member with access may set it for
  // themselves — including for shared group collections (not admin-gated).
  .openapi(setDeckbuilding, async (c) => {
    const { collections, collectionDeckbuildingPrefs } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const { available } = c.req.valid("json");

    const access = await collections.getAccessForUser(id, userId);
    assertFound(access, "Not found");

    await collectionDeckbuildingPrefs.set(userId, id, available);
    return c.body(null, 204);
  });
