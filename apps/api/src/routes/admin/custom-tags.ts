import { ERROR_CODES } from "@openrift/shared";
import type {
  AdminCustomTagAssignmentsResponse,
  AdminCustomTagCategoryListResponse,
  AdminCustomTagListResponse,
  CustomTagCategoryResponse,
  CustomTagResponse,
} from "@openrift/shared";
import { adminCustomTagsContract } from "@openrift/shared/contracts/admin/custom-tags";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertFound } from "../../lib/assertions.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminCustomTagsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin custom-tags taxonomy: tag categories, tags, and per-card assignment.
 * Conflict / not-found / bad-request states are thrown as `AppError` and mapped
 * by the handler's appErrorInterceptor.
 */
export const adminCustomTagsRouter = {
  // ── Categories ────────────────────────────────────────────────────────────
  listCategories: os.listCategories.handler(
    async ({ context }): Promise<AdminCustomTagCategoryListResponse> => {
      const { customTagCategories: catRepo, customTags: tagRepo } = context.repos;
      const [cats, tags] = await Promise.all([catRepo.listAll(), tagRepo.listAll()]);
      const counts = new Map<string, number>();
      for (const tag of tags) {
        counts.set(tag.categoryId, (counts.get(tag.categoryId) ?? 0) + 1);
      }
      return {
        categories: cats.map((cat): CustomTagCategoryResponse => ({
          id: cat.id,
          slug: cat.slug,
          label: cat.label,
          description: cat.description,
          sortOrder: cat.sortOrder,
          tagCount: counts.get(cat.id) ?? 0,
          createdAt: cat.createdAt.toISOString(),
          updatedAt: cat.updatedAt.toISOString(),
        })),
      };
    },
  ),

  createCategory: os.createCategory.handler(async ({ input, context }) => {
    const { customTagCategories: repo } = context.repos;
    const { slug, label, description } = input;
    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Category "${slug}" already exists`);
    }
    const maxSortOrder = await repo.getMaxSortOrder();
    const created = await repo.create({ slug, label, description, sortOrder: maxSortOrder + 1 });
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
    return { category };
  }),

  updateCategory: os.updateCategory.handler(async ({ input, context }): Promise<void> => {
    const { customTagCategories: repo } = context.repos;
    const { id, ...body } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Custom-tag category not found");
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
      }
    }
    await repo.update(id, body);
  }),

  removeCategory: os.removeCategory.handler(async ({ input, context }): Promise<void> => {
    const { customTagCategories: repo } = context.repos;
    const { id } = input;
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
  }),

  // ── Tags ──────────────────────────────────────────────────────────────────
  listTags: os.listTags.handler(async ({ context }): Promise<AdminCustomTagListResponse> => {
    const { customTags: repo } = context.repos;
    const [rows, assignments] = await Promise.all([repo.listAll(), repo.assignmentsByCard()]);
    const counts = new Map<string, number>();
    for (const slugs of assignments.values()) {
      for (const slug of slugs) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    return {
      tags: rows.map((r): CustomTagResponse => ({
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
      })),
    };
  }),

  listAssignments: os.listAssignments.handler(
    async ({ context }): Promise<AdminCustomTagAssignmentsResponse> => {
      const { customTags: repo } = context.repos;
      const map = await repo.assignmentsByCard();
      return { assignments: Object.fromEntries(map) };
    },
  ),

  createTag: os.createTag.handler(async ({ input, context }) => {
    const { customTags: repo, customTagCategories: catRepo } = context.repos;
    const { slug, label, categoryId, description } = input;
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
    return { tag };
  }),

  updateTag: os.updateTag.handler(async ({ input, context }): Promise<void> => {
    const { customTags: repo, customTagCategories: catRepo } = context.repos;
    const { id, ...body } = input;
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
  }),

  removeTag: os.removeTag.handler(async ({ input, context }): Promise<void> => {
    const { customTags: repo } = context.repos;
    const { id } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Custom tag not found");
    await repo.deleteById(id);
  }),

  addCards: os.addCards.handler(async ({ input, context }) => {
    const { customTags: repo } = context.repos;
    const { id, cardIds } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Custom tag not found");
    const added = await repo.addToCards(id, cardIds);
    return { added, requested: cardIds.length };
  }),

  clearCards: os.clearCards.handler(async ({ input, context }) => {
    const { customTags: repo } = context.repos;
    const { id } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Custom tag not found");
    const removed = await repo.clearAssignments(id);
    return { removed };
  }),

  // ── Per-card assignment ─────────────────────────────────────────────────
  getCardTags: os.getCardTags.handler(async ({ input, context }) => {
    const { customTags: repo, catalog } = context.repos;
    const card = await catalog.cardById(input.id);
    assertFound(card, "Card not found");
    const customTagIds = await repo.tagIdsForCard(input.id);
    return { customTagIds };
  }),

  setCardTags: os.setCardTags.handler(async ({ input, context }): Promise<void> => {
    const { customTags: repo, catalog } = context.repos;
    const { id, customTagIds } = input;
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
  }),
};
