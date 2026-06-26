import { oc } from "@orpc/contract";
import { z } from "zod";

import { slugRegex } from "./shared.js";

const TAG = "Admin - Custom Tags";

const BASE = "/api/admin/v1";
const CATEGORIES = `${BASE}/custom-tag-categories`;
const TAGS = `${BASE}/custom-tags`;

const customTagSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  category: z.string(),
  categoryLabel: z.string(),
  categoryId: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  cardCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const customTagCategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  tagCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const idParamSchema = z.object({ id: z.uuid() });

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
  categoryId: z.string().uuid(),
  description: z.string().min(1).nullable().optional(),
});

const updateCustomTagInput = z.object({
  slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
  label: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().min(1).nullable().optional(),
});

/**
 * oRPC contract for the admin custom-tags taxonomy (mounted under
 * `/api/admin/v1`, admin-gated by the mount). Covers three groups: tag
 * categories, the tags themselves, and per-card assignment. Conflict /
 * not-found / bad-request states are thrown as `AppError` and bridged to
 * ORPCErrors in the implementation. The static `custom-tags/assignments` path
 * precedes `custom-tags/{id}` internally.
 */
export const adminCustomTagsContract = {
  // ── Categories ────────────────────────────────────────────────────────────
  listCategories: oc
    .route({ method: "GET", path: CATEGORIES, tags: [TAG] })
    .output(z.object({ categories: z.array(customTagCategorySchema) })),
  createCategory: oc
    .route({ method: "POST", path: CATEGORIES, tags: [TAG], successStatus: 201 })
    .input(createCustomTagCategoryInput)
    .output(z.object({ category: customTagCategorySchema })),
  updateCategory: oc
    .route({ method: "PATCH", path: `${CATEGORIES}/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema.extend(updateCustomTagCategoryInput.shape)),
  removeCategory: oc
    .route({ method: "DELETE", path: `${CATEGORIES}/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema),

  // ── Tags ──────────────────────────────────────────────────────────────────
  listTags: oc
    .route({ method: "GET", path: TAGS, tags: [TAG] })
    .output(z.object({ tags: z.array(customTagSchema) })),
  listAssignments: oc
    .route({ method: "GET", path: `${TAGS}/assignments`, tags: [TAG] })
    .output(z.object({ assignments: z.record(z.string(), z.array(z.string())) })),
  createTag: oc
    .route({ method: "POST", path: TAGS, tags: [TAG], successStatus: 201 })
    .input(createCustomTagInput)
    .output(z.object({ tag: customTagSchema })),
  updateTag: oc
    .route({ method: "PATCH", path: `${TAGS}/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema.extend(updateCustomTagInput.shape)),
  removeTag: oc
    .route({ method: "DELETE", path: `${TAGS}/{id}`, tags: [TAG], successStatus: 204 })
    .input(idParamSchema),
  addCards: oc
    .route({ method: "POST", path: `${TAGS}/{id}/cards`, tags: [TAG] })
    .input(idParamSchema.extend({ cardIds: z.array(z.string().uuid()) }))
    .output(z.object({ added: z.number(), requested: z.number() })),

  // ── Per-card assignment ─────────────────────────────────────────────────
  getCardTags: oc
    .route({ method: "GET", path: `${BASE}/cards/{id}/custom-tags`, tags: [TAG] })
    .input(idParamSchema)
    .output(z.object({ customTagIds: z.array(z.string()) })),
  setCardTags: oc
    .route({
      method: "PUT",
      path: `${BASE}/cards/{id}/custom-tags`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParamSchema.extend({ customTagIds: z.array(z.string().uuid()) })),
};

export type AdminCustomTagsContract = typeof adminCustomTagsContract;
