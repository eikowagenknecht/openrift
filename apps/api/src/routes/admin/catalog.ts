import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { AdminSetResponse } from "@openrift/shared";
import { idParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { createSetSchema, reorderSetsSchema, updateSetSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listSets = createRoute({
  method: "get",
  path: "/sets",
  tags: ["Admin - Catalog"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            sets: z.array(
              z.object({
                id: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
                slug: z.string().openapi({ example: "OGN" }),
                name: z.string().openapi({ example: "Origins" }),
                printedTotal: z.number().nullable().openapi({ example: 298 }),
                sortOrder: z.number().openapi({ example: 1 }),
                releasedAt: z.string().nullable().openapi({ example: "2025-10-31" }),
                cardCount: z.number().openapi({ example: 312 }),
                printingCount: z.number().openapi({ example: 468 }),
              }),
            ),
          }),
        },
      },
      description: "List sets",
    },
  },
});

const updateSet = createRoute({
  method: "patch",
  path: "/sets/{id}",
  tags: ["Admin - Catalog"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateSetSchema } } },
  },
  responses: {
    204: { description: "Set updated" },
  },
});

const createSet = createRoute({
  method: "post",
  path: "/sets",
  tags: ["Admin - Catalog"],
  request: {
    body: { content: { "application/json": { schema: createSetSchema } } },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().openapi({ example: "019cfc3b-0369-7890-a450-7859471cc3f6" }),
          }),
        },
      },
      description: "Set created",
    },
  },
});

const deleteSet = createRoute({
  method: "delete",
  path: "/sets/{id}",
  tags: ["Admin - Catalog"],
  request: {
    params: idParamSchema,
  },
  responses: {
    204: { description: "Set deleted" },
  },
});

const reorderSets = createRoute({
  method: "put",
  path: "/sets/reorder",
  tags: ["Admin - Catalog"],
  request: {
    body: { content: { "application/json": { schema: reorderSetsSchema } } },
  },
  responses: {
    204: { description: "Sets reordered" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const catalogRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── Sets CRUD ─────────────────────────────────────────────────────────────────

  .openapi(listSets, async (c) => {
    const { sets: setsRepo } = c.get("repos");

    const [sets, cardCounts, printingCounts] = await Promise.all([
      setsRepo.listAll(),
      setsRepo.cardCountsBySet(),
      setsRepo.printingCountsBySet(),
    ]);

    const cardCountMap = new Map(cardCounts.map((r) => [r.setId, r.cardCount]));
    const printingCountMap = new Map(printingCounts.map((r) => [r.setId, r.printingCount]));

    return c.json({
      sets: sets.map(
        (s): AdminSetResponse => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          printedTotal: s.printedTotal,
          sortOrder: s.sortOrder,
          releasedAt: s.releasedAt,
          cardCount: cardCountMap.get(s.id) ?? 0,
          printingCount: printingCountMap.get(s.id) ?? 0,
        }),
      ),
    });
  })

  .openapi(updateSet, async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id } = c.req.valid("param");
    const { name, printedTotal, releasedAt } = c.req.valid("json");

    const updated = await setsRepo.update(id, { name, printedTotal, releasedAt });
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Set "${id}" not found`);
    }

    return c.body(null, 204);
  })

  .openapi(createSet, async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id, name, printedTotal, releasedAt } = c.req.valid("json");

    const setId = await setsRepo.createIfNotExists({ slug: id, name, printedTotal, releasedAt });
    if (!setId) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Set with ID "${id}" already exists`);
    }

    return c.json({ id: setId }, 201);
  })

  .openapi(deleteSet, async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { id } = c.req.valid("param");

    const printingCount = await setsRepo.printingCount(id);
    if (printingCount > 0) {
      throw new AppError(
        409,
        "CONFLICT",
        `Cannot delete set "${id}" — it still has ${printingCount} printing(s). Remove them first.`,
      );
    }

    await setsRepo.deleteById(id);

    return c.body(null, 204);
  })

  // ── Set reorder ───────────────────────────────────────────────────────────────

  .openapi(reorderSets, async (c) => {
    const { sets: setsRepo } = c.get("repos");
    const { ids } = c.req.valid("json");

    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate set IDs in reorder list.");
    }

    const allSets = await setsRepo.listAll();
    if (ids.length !== allSets.length) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Expected ${allSets.length} set IDs but received ${ids.length}. All sets must be included in the reorder.`,
      );
    }

    const knownIds = new Set(allSets.map((s) => s.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown set IDs: ${unknown.join(", ")}`);
    }

    await setsRepo.reorder(ids);
    return c.body(null, 204);
  });
