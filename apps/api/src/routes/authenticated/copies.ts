import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  CopyCollectionBreakdownEntry,
  CopyCollectionBreakdownResponse,
  CopyListResponse,
} from "@openrift/shared";
import {
  copyCollectionBreakdownResponseSchema,
  copyListResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  addCopiesSchema,
  copiesQuerySchema,
  disposeCopiesSchema,
  moveCopiesSchema,
} from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";
import { toCopy } from "../../utils/mappers.js";

const listCopies = createRoute({
  method: "get",
  path: "/",
  tags: ["Copies"],
  request: { query: copiesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: copyListResponseSchema } },
      description: "Success",
    },
  },
});

const addCopies = createRoute({
  method: "post",
  path: "/",
  tags: ["Copies"],
  request: {
    body: { content: { "application/json": { schema: addCopiesSchema } } },
  },
  responses: {
    201: { description: "Created" },
  },
});

const moveCopies = createRoute({
  method: "post",
  path: "/move",
  tags: ["Copies"],
  request: {
    body: { content: { "application/json": { schema: moveCopiesSchema } } },
  },
  responses: {
    204: { description: "No Content" },
  },
});

const disposeCopies = createRoute({
  method: "post",
  path: "/dispose",
  tags: ["Copies"],
  request: {
    body: { content: { "application/json": { schema: disposeCopiesSchema } } },
  },
  responses: {
    204: { description: "No Content" },
  },
});

const countCopiesByCollection = createRoute({
  method: "get",
  path: "/count-by-collection",
  tags: ["Copies"],
  responses: {
    200: {
      content: { "application/json": { schema: copyCollectionBreakdownResponseSchema } },
      description: "Success",
    },
  },
});

const copiesApp = new OpenAPIHono<{ Variables: Variables }>().basePath("/copies");
copiesApp.use(requireAuth);
export const copiesRoute = copiesApp
  // ── GET /copies ─────────────────────────────────────────────────────────────
  // All copies for the authenticated user (combined view)

  .openapi(listCopies, async (c) => {
    const { copies } = c.get("repos");
    const { cursor, limit } = c.req.valid("query");
    const effectiveLimit = limit ?? 500;

    const rows = await copies.listForUser(getUserId(c), effectiveLimit, cursor);
    const hasMore = rows.length > effectiveLimit;
    const items = rows.slice(0, effectiveLimit);

    return c.json({
      items: items.map((row) => toCopy(row)),
      nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
    } satisfies CopyListResponse);
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
    return c.json(created, 201);
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
  })

  // ── GET /copies/count-by-collection ─────────────────────────────────────────
  // Returns per-(printing, collection) copy counts for the authenticated user.
  // Totals per printing can be derived by summing the entries.

  .openapi(countCopiesByCollection, async (c) => {
    const { copies } = c.get("repos");
    const rows = await copies.countByCollectionForUser(getUserId(c));

    const items: Record<string, CopyCollectionBreakdownEntry[]> = {};
    for (const row of rows) {
      (items[row.printingId] ??= []).push({
        collectionId: row.collectionId,
        collectionName: row.collectionName,
        count: row.count,
      });
    }
    return c.json({ items } satisfies CopyCollectionBreakdownResponse);
  });
