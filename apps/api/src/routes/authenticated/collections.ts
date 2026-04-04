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
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types";

import { AppError, ERROR_CODES } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildPatchUpdates } from "../../patch.js";
import type { FieldMapping } from "../../patch.js";
import type { Variables } from "../../types.js";
import { toCollection, toCopy } from "../../utils/mappers.js";

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
    const { collections, marketplace, userPreferences } = c.get("repos");
    const { ensureInbox } = c.get("services");
    const userId = getUserId(c);
    await ensureInbox(c.get("repos"), userId);
    const prefs = await userPreferences.getByUserId(userId);
    const favMarketplace =
      prefs?.data?.marketplaceOrder?.[0] ?? PREFERENCE_DEFAULTS.marketplaceOrder[0];
    const [rows, values] = await Promise.all([
      collections.listForUser(userId),
      marketplace.collectionValues(userId, favMarketplace),
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
    const { collections, marketplace, userPreferences } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const row = await collections.getByIdForUser(id, userId);
    if (!row) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
    const prefs = await userPreferences.getByUserId(userId);
    const favMarketplace =
      prefs?.data?.marketplaceOrder?.[0] ?? PREFERENCE_DEFAULTS.marketplaceOrder[0];
    const values = await marketplace.collectionValues(userId, favMarketplace);
    return c.json(toCollection(row, values.get(row.id)));
  })

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  .openapi(updateCollection, async (c) => {
    const { collections } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updates = buildPatchUpdates(body, patchFields);
    const row = await collections.update(id, userId, updates);
    if (!row) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }
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

    if (!collection) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

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
    if (!collection) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Not found");
    }

    const rows = await copies.listForCollection(id, limit, cursor);
    const hasMore = limit !== undefined && rows.length > limit;
    const items = limit === undefined ? rows : rows.slice(0, limit);

    return c.json({
      items: items.map((row) => toCopy(row)),
      nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
    } satisfies CopyListResponse);
  });
