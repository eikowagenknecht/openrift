import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Custom Tags";

const BASE = "/api/admin/v1";
const CATEGORIES = `${BASE}/custom-tag-categories`;
const TAGS = `${BASE}/custom-tags`;

export const customTagSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  category: z.string(),
  categoryLabel: z.string(),
  categoryId: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  cardCount: z.number(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const customTagCategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  tagCount: z.number(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const adminCustomTagListResponseSchema = z
  .object({ tags: z.array(customTagSchema) })
  .openapi("AdminCustomTagListResponse");

export const adminCustomTagCategoryListResponseSchema = z
  .object({ categories: z.array(customTagCategorySchema) })
  .openapi("AdminCustomTagCategoryListResponse");

export const adminCustomTagAssignmentsResponseSchema = z
  .object({
    assignments: z.record(z.string(), z.array(z.string())),
  })
  .openapi("AdminCustomTagAssignmentsResponse");

const createCustomTagCategoryInput = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. region)"),
  label: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
});

const updateCustomTagCategoryInput = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
});

const createCustomTagInput = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. bandle-city)"),
  label: z.string().min(1),
  categoryId: z.uuid(),
  description: z.string().min(1).nullable().optional(),
});

const updateCustomTagInput = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  categoryId: z.uuid().optional(),
  description: z.string().min(1).nullable().optional(),
});

/** The static `custom-tags/assignments` path precedes `custom-tags/{id}` internally. */
export const adminCustomTagsContract = {
  listCategories: authedRoute
    .route({ method: "GET", path: CATEGORIES, tags: [TAG] })
    .output(adminCustomTagCategoryListResponseSchema),
  createCategory: authedRoute
    .route({ method: "POST", path: CATEGORIES, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "Category already exists" } })
    .input(createCustomTagCategoryInput)
    .output(z.object({ category: customTagCategorySchema })),
  updateCategory: authedRoute
    .route({ method: "PATCH", path: `${CATEGORIES}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Category not found" },
      CONFLICT: { message: "Slug already in use" },
    })
    .input(withParams(idParamSchema, updateCustomTagCategoryInput)),
  removeCategory: authedRoute
    .route({ method: "DELETE", path: `${CATEGORIES}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Category not found" },
      CONFLICT: { message: "Category is in use by one or more tags" },
    })
    .input(idParamSchema),

  listTags: authedRoute
    .route({ method: "GET", path: TAGS, tags: [TAG] })
    .output(adminCustomTagListResponseSchema),
  listAssignments: authedRoute
    .route({ method: "GET", path: `${TAGS}/assignments`, tags: [TAG] })
    .output(adminCustomTagAssignmentsResponseSchema),
  createTag: authedRoute
    .route({ method: "POST", path: TAGS, tags: [TAG], successStatus: 201 })
    .errors({
      BAD_REQUEST: { message: "Unknown category" },
      CONFLICT: { message: "Custom tag already exists" },
    })
    .input(createCustomTagInput)
    .output(z.object({ tag: customTagSchema })),
  updateTag: authedRoute
    .route({ method: "PATCH", path: `${TAGS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Custom tag not found" },
      CONFLICT: { message: "Slug already in use" },
      BAD_REQUEST: { message: "Unknown category" },
    })
    .input(withParams(idParamSchema, updateCustomTagInput)),
  removeTag: authedRoute
    .route({ method: "DELETE", path: `${TAGS}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Custom tag not found" } })
    .input(idParamSchema),
  addCards: authedRoute
    .route({ method: "POST", path: `${TAGS}/{id}/cards`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Custom tag not found" } })
    .input(withParams(idParamSchema, { cardIds: z.array(z.uuid()) }))
    .output(z.object({ added: z.number(), requested: z.number() })),
  clearCards: authedRoute
    .route({ method: "DELETE", path: `${TAGS}/{id}/cards`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Custom tag not found" } })
    .input(idParamSchema)
    .output(z.object({ removed: z.number() })),

  getCardTags: authedRoute
    .route({ method: "GET", path: `${BASE}/cards/{id}/custom-tags`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Card not found" } })
    .input(idParamSchema)
    .output(z.object({ customTagIds: z.array(z.string()) })),
  setCardTags: authedRoute
    .route({
      method: "PUT",
      path: `${BASE}/cards/{id}/custom-tags`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Card not found" },
      BAD_REQUEST: { message: "Unknown custom tag" },
    })
    .input(withParams(idParamSchema, { customTagIds: z.array(z.uuid()) })),
};

export type AdminCustomTagsContract = typeof adminCustomTagsContract;
