import { zValidator } from "@hono/zod-validator";
import type { CopyCountResponse, CopyListResponse } from "@openrift/shared";
import {
  addCopiesSchema,
  copiesQuerySchema,
  disposeCopiesSchema,
  idParamSchema,
  moveCopiesSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";
import { toCopy } from "../../utils/mappers.js";

export const copiesRoute = new Hono<{ Variables: Variables }>()
  .basePath("/copies")
  .use(requireAuth)

  // ── GET /copies ─────────────────────────────────────────────────────────────
  // All copies for the authenticated user (combined view)

  .get("/", zValidator("query", copiesQuerySchema), async (c) => {
    const { copies } = c.get("repos");
    const { cursor, limit: rawLimit } = c.req.valid("query");
    const limit = rawLimit ?? 200;

    const rows = await copies.listForUser(getUserId(c), limit, cursor);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    return c.json({
      items: items.map((row) => toCopy(row)),
      nextCursor: hasMore ? (items.at(-1)?.createdAt.toISOString() ?? null) : null,
    } satisfies CopyListResponse);
  })

  // ── POST /copies ────────────────────────────────────────────────────────────
  // Batch add copies (acquisition)

  .post("/", zValidator("json", addCopiesSchema), async (c) => {
    const { addCopies } = c.get("services");
    const repos = c.get("repos");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const created = await addCopies(repos, transact, userId, body.copies);
    return c.json(created, 201);
  })

  // ── POST /copies/move ───────────────────────────────────────────────────────
  // Move copies between collections (reorganization)

  .post("/move", zValidator("json", moveCopiesSchema), async (c) => {
    const { moveCopies } = c.get("services");
    const repos = c.get("repos");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await moveCopies(repos, transact, userId, body.copyIds, body.toCollectionId);
    return c.body(null, 204);
  })

  // ── POST /copies/dispose ────────────────────────────────────────────────────
  // Dispose copies (disposal) — hard-deletes with metadata snapshot

  .post("/dispose", zValidator("json", disposeCopiesSchema), async (c) => {
    const { disposeCopies } = c.get("services");
    const transact = c.get("transact");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    await disposeCopies(transact, userId, body.copyIds);
    return c.body(null, 204);
  })

  // ── GET /copies/count ───────────────────────────────────────────────────────
  // Returns owned count per printing for the authenticated user

  .get("/count", async (c) => {
    const { copies } = c.get("repos");
    const rows = await copies.countByPrintingForUser(getUserId(c));

    const counts: Record<string, number> = Object.fromEntries(
      rows.map((row) => [row.printingId, row.count]),
    );
    return c.json({ items: counts } satisfies CopyCountResponse);
  })

  // ── GET /copies/:id ─────────────────────────────────────────────────────────

  .get("/:id", zValidator("param", idParamSchema), async (c) => {
    const { copies } = c.get("repos");
    const { id } = c.req.valid("param");
    const copy = await copies.getByIdForUser(id, getUserId(c));
    if (!copy) {
      throw new AppError(404, "NOT_FOUND", "Not found");
    }
    return c.json(toCopy(copy));
  });
