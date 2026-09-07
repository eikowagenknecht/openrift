import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Card Tags";

const BASE = "/api/admin/v1";
const CATEGORIES = `${BASE}/tag-categories`;
const TAGS = `${BASE}/card-tags`;

export const tagCategoryResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  tagCount: z.number(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

// `categoryId` is null for unclassified tags; `cardCount` can be 0.
export const classifiedCardTagSchema = z.object({
  tag: z.string(),
  cardCount: z.number(),
  categoryId: z.string().nullable(),
});

export const adminTagCategoryListResponseSchema = z
  .object({ categories: z.array(tagCategoryResponseSchema) })
  .openapi("AdminTagCategoryListResponse");

export const adminCardTagListResponseSchema = z
  .object({ tags: z.array(classifiedCardTagSchema) })
  .openapi("AdminCardTagListResponse");

const createTagCategoryInput = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. species)"),
  label: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
});

const updateTagCategoryInput = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
});

// The DB enforces the same trimmed-non-empty constraint via a btrim check.
const printedTag = z
  .string()
  .min(1)
  .refine((t) => t === t.trim(), "Tag must not have leading or trailing whitespace");

/**
 * Distinct from the custom-tags taxonomy: here the card↔tag relation is
 * printed card data and only the tag→category mapping is editable. The tag
 * travels in the request body, never the path — values like "Kha’Zix" don't
 * URL-encode reliably.
 */
export const adminCardTagsContract = {
  listCategories: authedRoute
    .route({ method: "GET", path: CATEGORIES, tags: [TAG] })
    .output(adminTagCategoryListResponseSchema),
  createCategory: authedRoute
    .route({ method: "POST", path: CATEGORIES, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "Category already exists" } })
    .input(createTagCategoryInput)
    .output(z.object({ category: tagCategoryResponseSchema })),
  updateCategory: authedRoute
    .route({ method: "PATCH", path: `${CATEGORIES}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Category not found" },
      CONFLICT: { message: "Slug already in use" },
    })
    .input(withParams(idParamSchema, updateTagCategoryInput)),
  removeCategory: authedRoute
    .route({ method: "DELETE", path: `${CATEGORIES}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Category not found" },
      CONFLICT: { message: "Category is in use by one or more tags" },
    })
    .input(idParamSchema),

  listTags: authedRoute
    .route({ method: "GET", path: TAGS, tags: [TAG] })
    .output(adminCardTagListResponseSchema),
  setTagCategory: authedRoute
    .route({ method: "PUT", path: `${TAGS}/classification`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Unknown category" } })
    .input(z.object({ tag: printedTag, categoryId: z.uuid().nullable() })),
  detectLegendTags: authedRoute
    .route({ method: "POST", path: `${TAGS}/detect-legends`, tags: [TAG] })
    .errors({ BAD_REQUEST: { message: "Unknown category" } })
    .input(z.object({ categoryId: z.uuid() }))
    .output(
      z.object({
        found: z.number(),
        assigned: z.number(),
      }),
    ),
};

export type AdminCardTagsContract = typeof adminCardTagsContract;
