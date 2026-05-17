import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  AdminCustomTagAssignmentsResponse,
  AdminCustomTagCategoryListResponse,
  AdminCustomTagListResponse,
  CustomTagCategoryResponse,
  CustomTagResponse,
} from "@openrift/shared";
import { idParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import {
  addCardsToCustomTagSchema,
  createCustomTagCategorySchema,
  createCustomTagSchema,
  setCardCustomTagsSchema,
  updateCustomTagCategorySchema,
  updateCustomTagSchema,
} from "./schemas.js";

const customTagSchema = z.object({
  id: z.string().openapi({ example: "019d4999-4219-72f6-b7bb-64004e1b1bff" }),
  slug: z.string().openapi({ example: "bandle-city" }),
  label: z.string().openapi({ example: "Bandle City" }),
  category: z.string().openapi({ example: "region" }),
  categoryLabel: z.string().openapi({ example: "Region" }),
  categoryId: z.string().openapi({ example: "019d4999-0000-72f6-b7bb-64004e1b1bff" }),
  description: z.string().nullable().openapi({ example: null }),
  sortOrder: z.number().openapi({ example: 0 }),
  cardCount: z.number().openapi({ example: 12 }),
  createdAt: z.string().openapi({ example: "2026-05-15T10:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2026-05-15T10:00:00.000Z" }),
});

const customTagCategorySchema = z.object({
  id: z.string().openapi({ example: "019d4999-0000-72f6-b7bb-64004e1b1bff" }),
  slug: z.string().openapi({ example: "region" }),
  label: z.string().openapi({ example: "Region" }),
  description: z.string().nullable().openapi({ example: null }),
  sortOrder: z.number().openapi({ example: 0 }),
  tagCount: z.number().openapi({ example: 3 }),
  createdAt: z.string().openapi({ example: "2026-05-15T10:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2026-05-15T10:00:00.000Z" }),
});

const listCustomTagCategories = createRoute({
  method: "get",
  path: "/custom-tag-categories",
  tags: ["Admin - Custom Tags"],
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ categories: z.array(customTagCategorySchema) }) },
      },
      description: "List custom-tag categories with tag-count usage",
    },
  },
});

const createCustomTagCategory = createRoute({
  method: "post",
  path: "/custom-tag-categories",
  tags: ["Admin - Custom Tags"],
  request: {
    body: { content: { "application/json": { schema: createCustomTagCategorySchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ category: customTagCategorySchema }) } },
      description: "Custom-tag category created",
    },
  },
});

const updateCustomTagCategory = createRoute({
  method: "patch",
  path: "/custom-tag-categories/{id}",
  tags: ["Admin - Custom Tags"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateCustomTagCategorySchema } } },
  },
  responses: { 204: { description: "Custom-tag category updated" } },
});

const deleteCustomTagCategory = createRoute({
  method: "delete",
  path: "/custom-tag-categories/{id}",
  tags: ["Admin - Custom Tags"],
  request: { params: idParamSchema },
  responses: {
    204: { description: "Custom-tag category deleted" },
    409: { description: "Category is in use by one or more tags" },
  },
});

const listCustomTags = createRoute({
  method: "get",
  path: "/custom-tags",
  tags: ["Admin - Custom Tags"],
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ tags: z.array(customTagSchema) }) },
      },
      description: "List custom tags with card-count usage",
    },
  },
});

const listCustomTagAssignments = createRoute({
  method: "get",
  path: "/custom-tags/assignments",
  tags: ["Admin - Custom Tags"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ assignments: z.record(z.string(), z.array(z.string())) }),
        },
      },
      description: "Map of card id → custom-tag slugs",
    },
  },
});

const createCustomTag = createRoute({
  method: "post",
  path: "/custom-tags",
  tags: ["Admin - Custom Tags"],
  request: { body: { content: { "application/json": { schema: createCustomTagSchema } } } },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ tag: customTagSchema }) } },
      description: "Custom tag created",
    },
  },
});

const updateCustomTag = createRoute({
  method: "patch",
  path: "/custom-tags/{id}",
  tags: ["Admin - Custom Tags"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: updateCustomTagSchema } } },
  },
  responses: { 204: { description: "Custom tag updated" } },
});

const deleteCustomTag = createRoute({
  method: "delete",
  path: "/custom-tags/{id}",
  tags: ["Admin - Custom Tags"],
  request: { params: idParamSchema },
  responses: { 204: { description: "Custom tag deleted (assignments cascade)" } },
});

const setCardCustomTags = createRoute({
  method: "put",
  path: "/cards/{id}/custom-tags",
  tags: ["Admin - Custom Tags"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: setCardCustomTagsSchema } } },
  },
  responses: { 204: { description: "Card's custom tags replaced" } },
});

const getCardCustomTags = createRoute({
  method: "get",
  path: "/cards/{id}/custom-tags",
  tags: ["Admin - Custom Tags"],
  request: { params: idParamSchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ customTagIds: z.array(z.string()) }),
        },
      },
      description: "Custom-tag ids currently assigned to this card",
    },
  },
});

const addCardsToCustomTag = createRoute({
  method: "post",
  path: "/custom-tags/{id}/cards",
  tags: ["Admin - Custom Tags"],
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: addCardsToCustomTagSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            added: z.number().openapi({ example: 12 }),
            requested: z.number().openapi({ example: 15 }),
          }),
        },
      },
      description: "Bulk-attached cards to a custom tag",
    },
  },
});

export const adminCustomTagsRoute = new OpenAPIHono<{ Variables: Variables }>()
  // ── Categories ─────────────────────────────────────────────────────────
  .openapi(listCustomTagCategories, async (c) => {
    const { customTagCategories: catRepo, customTags: tagRepo } = c.get("repos");
    const [cats, tags] = await Promise.all([catRepo.listAll(), tagRepo.listAll()]);
    const counts = new Map<string, number>();
    for (const tag of tags) {
      counts.set(tag.categoryId, (counts.get(tag.categoryId) ?? 0) + 1);
    }
    const body: AdminCustomTagCategoryListResponse = {
      categories: cats.map(
        (cat): CustomTagCategoryResponse => ({
          id: cat.id,
          slug: cat.slug,
          label: cat.label,
          description: cat.description,
          sortOrder: cat.sortOrder,
          tagCount: counts.get(cat.id) ?? 0,
          createdAt: cat.createdAt.toISOString(),
          updatedAt: cat.updatedAt.toISOString(),
        }),
      ),
    };
    return c.json(body);
  })
  .openapi(createCustomTagCategory, async (c) => {
    const { customTagCategories: repo } = c.get("repos");
    const { slug, label, description } = c.req.valid("json");
    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Category "${slug}" already exists`);
    }
    const maxSortOrder = await repo.getMaxSortOrder();
    const created = await repo.create({
      slug,
      label,
      description,
      sortOrder: maxSortOrder + 1,
    });
    const category: CustomTagCategoryResponse = {
      id: created.id,
      slug: created.slug,
      label: created.label,
      description: created.description,
      sortOrder: created.sortOrder,
      tagCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
    return c.json({ category }, 201);
  })
  .openapi(updateCustomTagCategory, async (c) => {
    const { customTagCategories: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const existing = await repo.getById(id);
    assertFound(existing, "Custom-tag category not found");
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
      }
    }
    await repo.update(id, body);
    return c.body(null, 204);
  })
  .openapi(deleteCustomTagCategory, async (c) => {
    const { customTagCategories: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const existing = await repo.getById(id);
    assertFound(existing, "Custom-tag category not found");
    if (await repo.isInUse(id)) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Category is in use by one or more tags — reassign them first",
      );
    }
    await repo.deleteById(id);
    return c.body(null, 204);
  })

  // ── Tags ───────────────────────────────────────────────────────────────
  .openapi(listCustomTags, async (c) => {
    const { customTags: repo } = c.get("repos");
    const [rows, assignments] = await Promise.all([repo.listAll(), repo.assignmentsByCard()]);
    const counts = new Map<string, number>();
    for (const slugs of assignments.values()) {
      for (const slug of slugs) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    const body: AdminCustomTagListResponse = {
      tags: rows.map(
        (r): CustomTagResponse => ({
          id: r.id,
          slug: r.slug,
          label: r.label,
          category: r.category,
          categoryLabel: r.categoryLabel,
          categoryId: r.categoryId,
          description: r.description,
          sortOrder: r.sortOrder,
          cardCount: counts.get(r.slug) ?? 0,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    };
    return c.json(body);
  })
  .openapi(listCustomTagAssignments, async (c) => {
    const { customTags: repo } = c.get("repos");
    const map = await repo.assignmentsByCard();
    const body: AdminCustomTagAssignmentsResponse = {
      assignments: Object.fromEntries(map),
    };
    return c.json(body);
  })
  .openapi(createCustomTag, async (c) => {
    const { customTags: repo, customTagCategories: catRepo } = c.get("repos");
    const { slug, label, categoryId, description } = c.req.valid("json");
    const category = await catRepo.getById(categoryId);
    if (!category) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown category id: ${categoryId}`);
    }
    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Custom tag "${slug}" already exists`);
    }
    const maxSortOrder = await repo.getMaxSortOrder(categoryId);
    const created = await repo.create({
      slug,
      label,
      categoryId,
      description,
      sortOrder: maxSortOrder + 1,
    });
    const tag: CustomTagResponse = {
      id: created.id,
      slug: created.slug,
      label: created.label,
      category: created.category,
      categoryLabel: created.categoryLabel,
      categoryId: created.categoryId,
      description: created.description,
      sortOrder: created.sortOrder,
      cardCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
    return c.json({ tag }, 201);
  })
  .openapi(updateCustomTag, async (c) => {
    const { customTags: repo, customTagCategories: catRepo } = c.get("repos");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const existing = await repo.getById(id);
    assertFound(existing, "Custom tag not found");
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
      }
    }
    if (body.categoryId !== undefined && body.categoryId !== existing.categoryId) {
      const category = await catRepo.getById(body.categoryId);
      if (!category) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown category id: ${body.categoryId}`);
      }
    }
    await repo.update(id, body);
    return c.body(null, 204);
  })
  .openapi(deleteCustomTag, async (c) => {
    const { customTags: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const existing = await repo.getById(id);
    assertFound(existing, "Custom tag not found");
    await repo.deleteById(id);
    return c.body(null, 204);
  })
  .openapi(getCardCustomTags, async (c) => {
    const { customTags: repo, catalog } = c.get("repos");
    const { id } = c.req.valid("param");
    const card = await catalog.cardById(id);
    assertFound(card, "Card not found");
    const customTagIds = await repo.tagIdsForCard(id);
    return c.json({ customTagIds });
  })
  .openapi(setCardCustomTags, async (c) => {
    const { customTags: repo, catalog } = c.get("repos");
    const { id } = c.req.valid("param");
    const { customTagIds } = c.req.valid("json");
    const card = await catalog.cardById(id);
    assertFound(card, "Card not found");
    if (customTagIds.length > 0) {
      const tags = await Promise.all(customTagIds.map((tagId) => repo.getById(tagId)));
      const missing = customTagIds.filter((_, i) => tags[i] === undefined);
      if (missing.length > 0) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          `Unknown custom-tag ids: ${missing.join(", ")}`,
        );
      }
    }
    await repo.setForCard(id, customTagIds);
    return c.body(null, 204);
  })
  .openapi(addCardsToCustomTag, async (c) => {
    const { customTags: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const { cardIds } = c.req.valid("json");
    const existing = await repo.getById(id);
    assertFound(existing, "Custom tag not found");
    const added = await repo.addToCards(id, cardIds);
    return c.json({ added, requested: cardIds.length });
  });
