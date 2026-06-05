import { createRoute } from "@hono/zod-openapi";
import type { CopyAddResponse, CopyListResponse } from "@openrift/shared";
import { copyAddResponseSchema, copyListResponseSchema } from "@openrift/shared/response-schemas";
import {
  addCopiesSchema,
  copiesQuerySchema,
  disposeCopiesSchema,
  moveCopiesSchema,
} from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { cookieAuth, errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
import { buildCopiesCursor, clampCopiesLimit } from "../../repositories/copies.js";
import { toCopy } from "../../utils/mappers.js";

const listCopies = createRoute({
  method: "get",
  path: "/",
  tags: ["Copies"],
  security: cookieAuth,
  request: { query: copiesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: copyListResponseSchema } },
      description: "Success",
    },
    ...errorResponses(400, 401),
  },
});

const addCopies = createRoute({
  method: "post",
  path: "/",
  tags: ["Copies"],
  security: cookieAuth,
  request: {
    body: { content: { "application/json": { schema: addCopiesSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: copyAddResponseSchema } },
      description: "Created",
    },
    ...errorResponses(400, 401, 403),
  },
});

const moveCopies = createRoute({
  method: "post",
  path: "/move",
  tags: ["Copies"],
  security: cookieAuth,
  request: {
    body: { content: { "application/json": { schema: moveCopiesSchema } } },
  },
  responses: {
    204: { description: "No Content" },
    ...errorResponses(400, 401, 403, 404),
  },
});

const disposeCopies = createRoute({
  method: "post",
  path: "/dispose",
  tags: ["Copies"],
  security: cookieAuth,
  request: {
    body: { content: { "application/json": { schema: disposeCopiesSchema } } },
  },
  responses: {
    204: { description: "No Content" },
    ...errorResponses(400, 401, 403, 404),
  },
});

const copiesApp = createApiApp().basePath("/copies");
copiesApp.use(requireAuth);
export const copiesRoute = copiesApp
  // ── GET /copies ─────────────────────────────────────────────────────────────
  // All copies the viewer can access: their personal collections plus the
  // shared collections of every group they belong to. Group-owned copies
  // (added by any member) appear to all members. Each row carries `groupId`
  // so the client can keep group copies out of personal "owned" totals.

  .openapi(listCopies, async (c) => {
    const { copies } = c.get("repos");
    const { cursor, limit } = c.req.valid("query");
    const effectiveLimit = clampCopiesLimit(limit);

    const rows = await copies.listForAccessibleCollections(getUserId(c), effectiveLimit, cursor);
    const hasMore = rows.length > effectiveLimit;
    const items = rows.slice(0, effectiveLimit);
    const lastItem = items.at(-1);

    return c.json(
      {
        items: items.map((row) => toCopy(row)),
        nextCursor: hasMore && lastItem ? buildCopiesCursor(lastItem.createdAt, lastItem.id) : null,
      } satisfies CopyListResponse,
      200,
    );
  })

  // ── POST /copies ────────────────────────────────────────────────────────────
  // Batch add copies (acquisition)

  .openapi(addCopies, async (c) => {
    const { addCopies: addCopiesService } = c.get("services");
    const repos = c.get("repos");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const created = await addCopiesService(repos, transact, userId, body.copies);
    return c.json({ items: created } satisfies CopyAddResponse, 201);
  })

  // ── POST /copies/move ───────────────────────────────────────────────────────
  // Move copies between collections (reorganization)

  .openapi(moveCopies, async (c) => {
    const { moveCopies: moveCopiesService } = c.get("services");
    const repos = c.get("repos");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await moveCopiesService(repos, transact, userId, body.copyIds, body.toCollectionId);
    return c.body(null, 204);
  })

  // ── POST /copies/dispose ────────────────────────────────────────────────────
  // Dispose copies (disposal) — hard-deletes with metadata snapshot

  .openapi(disposeCopies, async (c) => {
    const { disposeCopies: disposeCopiesService } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await disposeCopiesService(transact, userId, body.copyIds);
    return c.body(null, 204);
  });
