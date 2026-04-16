import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { CollectionListResponse, CopyListResponse } from "@openrift/shared";
import {
  collectionListResponseSchema,
  collectionResponseSchema,
  copyListResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  copiesQuerySchema,
  createCollectionSchema,
  idParamSchema,
  updateCollectionSchema,
} from "@openrift/shared/schemas";

import { AppError, ERROR_CODES } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import { buildCopiesCursor } from "../../repositories/copies.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { toCollection, toCopy } from "../../utils/mappers.js";
import { getFavoriteMarketplace } from "../../utils/preferences.js";

const patchFields: FieldMapping = {
  name: "name",
  description: "description",
  availableForDeckbuilding: "availableForDeckbuilding",
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

const collectionsApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/collections");
collectionsApp.use(requireAuth);
export const collectionsRoute = collectionsApp
  // ── LIST ────────────────────────────────────────────────────────────────────
  .openapi(listCollections, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const [rows, values] = await Promise.all([
      repos.collections.listForUser(userId),
      repos.marketplace.collectionValues(userId, favMarketplace),
    ]);
    return c.json({
      items: rows.map((row) => {
        const value = values.get(row.id);
        return toCollection(row, value);
      }),
    } satisfies CollectionListResponse);
  })

  // ── CREATE ──────────────────────────────────────────────────────────────────
  .openapi(createCollection, async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const row = await collections.create({
      userId,
      name: body.name,
      description: body.description ?? null,
      availableForDeckbuilding: body.availableForDeckbuilding ?? true,
      isInbox: false,
      sortOrder: 0,
    });
    return c.json(toCollection(row), 201);
  })

  // ── GET ONE ─────────────────────────────────────────────────────────────────
  .openapi(getCollection, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const row = await repos.collections.getByIdForUser(id, userId);
    assertFound(row, "Not found");
    const favMarketplace = await getFavoriteMarketplace(repos, userId);
    const value = await repos.marketplace.singleCollectionValue(row.id, favMarketplace);
    return c.json(toCollection(row, value));
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .openapi(updateCollection, async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updates = buildPatchUpdates(body, patchFields);
    const row = await collections.update(id, userId, updates);
    assertFound(row, "Not found");
    return c.json(toCollection(row));
  })

  // ── DELETE /collections/:id ─────────────────────────────────────────────────
  // Validates not inbox, auto-moves remaining copies to inbox, then deletes.
  .openapi(deleteCollection, async (c) => {
    const repos = c.get("repos");
    const transact = c.get("transact");
    const { ensureInbox, deleteCollection: deleteCollectionService } = c.get("services");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");

    const collection = await repos.collections.getByIdForUser(id, userId);
    assertFound(collection, "Not found");

    if (collection.isInbox) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Cannot delete inbox collection");
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

    // Verify collection belongs to user
    const collection = await collections.exists(id, userId);
    assertFound(collection, "Not found");

    const effectiveLimit = limit ?? 10_000;
    const rows = await copies.listForCollection(id, effectiveLimit, cursor);
    const hasMore = rows.length > effectiveLimit;
    const items = rows.slice(0, effectiveLimit);
    const lastItem = items.at(-1);

    return c.json({
      items: items.map((row) => toCopy(row)),
      nextCursor: hasMore && lastItem ? buildCopiesCursor(lastItem.createdAt, lastItem.id) : null,
    } satisfies CopyListResponse);
  });
