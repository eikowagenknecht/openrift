import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  CopyCollectionBreakdownResponse,
  CopyCountResponse,
  CopyListResponse,
} from "@openrift/shared";
import {
  copyCollectionBreakdownResponseSchema,
  copyCountResponseSchema,
  copyListResponseSchema,
  copyResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  addCopiesSchema,
  copiesQuerySchema,
  copyCollectionBreakdownQuerySchema,
  disposeCopiesSchema,
  idParamSchema,
  moveCopiesSchema,
} from "@openrift/shared/schemas";

import { AppError } from "../../errors.js";
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

const countCopies = createRoute({
  method: "get",
  path: "/count",
  tags: ["Copies"],
  responses: {
    200: {
      content: { "application/json": { schema: copyCountResponseSchema } },
      description: "Success",
    },
  },
});

const countCopiesByCollection = createRoute({
  method: "get",
  path: "/count-by-collection",
  tags: ["Copies"],
  request: { query: copyCollectionBreakdownQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: copyCollectionBreakdownResponseSchema } },
      description: "Success",
    },
  },
});

const getCopy = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Copies"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: copyResponseSchema } },
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

    const rows = await copies.listForUser(getUserId(c), limit, cursor);
    const hasMore = limit !== undefined && rows.length > limit;
    const items = limit === undefined ? rows : rows.slice(0, limit);

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

  // ── GET /copies/count ───────────────────────────────────────────────────────
  // Returns owned count per printing for the authenticated user

  .openapi(countCopies, async (c) => {
    const { copies } = c.get("repos");
    const rows = await copies.countByPrintingForUser(getUserId(c));

    const counts: Record<string, number> = Object.fromEntries(
      rows.map((row) => [row.printingId, row.count]),
    );
    return c.json({ items: counts } satisfies CopyCountResponse);
  })

  // ── GET /copies/count-by-collection ─────────────────────────────────────────
  // Returns per-collection copy counts for a single printing

  .openapi(countCopiesByCollection, async (c) => {
    const { copies } = c.get("repos");
    const { printingId } = c.req.valid("query");
    const rows = await copies.countByCollectionForPrinting(getUserId(c), printingId);
    return c.json({ items: rows } satisfies CopyCollectionBreakdownResponse);
  })

  // ── GET /copies/:id ─────────────────────────────────────────────────────────

  .openapi(getCopy, async (c) => {
    const { copies } = c.get("repos");
    const { id } = c.req.valid("param");
    const copy = await copies.getByIdForUser(id, getUserId(c));
    if (!copy) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toCopy(copy));
  });
