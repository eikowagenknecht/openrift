import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const domainSchema = z.object({
  slug: z.string().openapi({ example: "Chaos" }),
  label: z.string().openapi({ example: "Chaos" }),
  sortOrder: z.number().openapi({ example: 5 }),
  isWellKnown: z.boolean().openapi({ example: true }),
  color: z.string().nullable().openapi({ example: "#b8336a" }),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();

// ── Route definitions ───────────────────────────────────────────────────────

const listDomains = createRoute({
  method: "get",
  path: "/domains",
  tags: ["Admin - Domains"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ domains: z.array(domainSchema) }),
        },
      },
      description: "List domains",
    },
  },
});

const reorderDomains = createRoute({
  method: "put",
  path: "/domains/reorder",
  tags: ["Admin - Domains"],
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
    204: { description: "Domains reordered" },
  },
});

const createDomain = createRoute({
  method: "post",
  path: "/domains",
  tags: ["Admin - Domains"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            slug: z.string().min(1),
            label: z.string().min(1),
            color: hexColorSchema.optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({ domain: domainSchema }),
        },
      },
      description: "Domain created",
    },
  },
});

const updateDomain = createRoute({
  method: "patch",
  path: "/domains/{slug}",
  tags: ["Admin - Domains"],
  request: {
    params: slugParamSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            label: z.string().min(1).optional(),
            color: hexColorSchema.optional(),
          }),
        },
      },
    },
  },
  responses: {
    204: { description: "Domain updated" },
  },
});

const deleteDomain = createRoute({
  method: "delete",
  path: "/domains/{slug}",
  tags: ["Admin - Domains"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Domain deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminDomainsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/domains ──────────────────────────────────────────────
  .openapi(listDomains, async (c) => {
    const { domains: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ domains: rows });
  })

  // ── PUT /admin/domains/reorder ──────────────────────────────────────
  .openapi(reorderDomains, async (c) => {
    const { domains: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allDomains = await repo.listAll();
    if (slugs.length !== allDomains.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allDomains.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allDomains.map((domain) => domain.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown domain slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── POST /admin/domains ─────────────────────────────────────────────
  .openapi(createDomain, async (c) => {
    const { domains: repo } = c.get("repos");
    const { slug, label, color } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Domain "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label, color });
    return c.json({ domain: created }, 201);
  })

  // ── PATCH /admin/domains/:slug ──────────────────────────────────────
  .openapi(updateDomain, async (c) => {
    const { domains: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Domain "${slug}" not found`);
    }

    const updates: { label?: string; color?: string | null } = {};
    if (body.label !== undefined) {
      updates.label = body.label;
    }
    if (body.color !== undefined) {
      updates.color = body.color;
    }

    if (Object.keys(updates).length > 0) {
      await repo.update(slug, updates);
    }

    return c.body(null, 204);
  })

  // ── DELETE /admin/domains/:slug ─────────────────────────────────────
  .openapi(deleteDomain, async (c) => {
    const { domains: repo } = c.get("repos");
    const { slug } = c.req.valid("param");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Domain "${slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known domain");
    }

    const inUse = await repo.isInUse(slug);
    if (inUse) {
      throw new AppError(409, "CONFLICT", "Cannot delete: domain is in use by one or more cards");
    }

    await repo.deleteBySlug(slug);
    return c.body(null, 204);
  });
