import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const finishSchema = z.object({
  slug: z.string().openapi({ example: "foil" }),
  label: z.string().openapi({ example: "Foil" }),
  sortOrder: z.number().openapi({ example: 2 }),
  isWellKnown: z.boolean().openapi({ example: true }),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

// ── Route definitions ───────────────────────────────────────────────────────

const listFinishes = createRoute({
  method: "get",
  path: "/finishes",
  tags: ["Admin - Finishes"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ finishes: z.array(finishSchema) }),
        },
      },
      description: "List finishes",
    },
  },
});

const reorderFinishes = createRoute({
  method: "put",
  path: "/finishes/reorder",
  tags: ["Admin - Finishes"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ slugs: z.array(z.string().min(1)).min(1) }),
        },
      },
    },
  },
  responses: {
    204: { description: "Finishes reordered" },
  },
});

const createFinish = createRoute({
  method: "post",
  path: "/finishes",
  tags: ["Admin - Finishes"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            slug: z
              .string()
              .min(1)
              .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "Slug must be kebab-case"),
            label: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({ finish: finishSchema }),
        },
      },
      description: "Finish created",
    },
  },
});

const updateFinish = createRoute({
  method: "patch",
  path: "/finishes/{slug}",
  tags: ["Admin - Finishes"],
  request: {
    params: slugParamSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({ label: z.string().min(1).optional() }),
        },
      },
    },
  },
  responses: {
    204: { description: "Finish updated" },
  },
});

const deleteFinish = createRoute({
  method: "delete",
  path: "/finishes/{slug}",
  tags: ["Admin - Finishes"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Finish deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminFinishesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/finishes ──────────────────────────────────────────────
  .openapi(listFinishes, async (c) => {
    const { finishes: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ finishes: rows });
  })

  // ── PUT /admin/finishes/reorder ──────────────────────────────────────
  .openapi(reorderFinishes, async (c) => {
    const { finishes: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allFinishes = await repo.listAll();
    if (slugs.length !== allFinishes.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allFinishes.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allFinishes.map((finish) => finish.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown finish slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── POST /admin/finishes ─────────────────────────────────────────────
  .openapi(createFinish, async (c) => {
    const { finishes: repo } = c.get("repos");
    const { slug, label } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Finish "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
    return c.json({ finish: created }, 201);
  })

  // ── PATCH /admin/finishes/:slug ──────────────────────────────────────
  .openapi(updateFinish, async (c) => {
    const { finishes: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Finish "${slug}" not found`);
    }

    if (body.label) {
      await repo.update(slug, { label: body.label });
    }

    return c.body(null, 204);
  })

  // ── DELETE /admin/finishes/:slug ─────────────────────────────────────
  .openapi(deleteFinish, async (c) => {
    const { finishes: repo } = c.get("repos");
    const { slug } = c.req.valid("param");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Finish "${slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known finish");
    }

    const inUse = await repo.isInUse(slug);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: finish is in use by one or more printings",
      );
    }

    await repo.deleteBySlug(slug);
    return c.body(null, 204);
  });
