import { adminCardTagsContract } from "@openrift/shared/contracts/admin/card-tags";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  AdminCardTagListResponse,
  AdminTagCategoryListResponse,
  TagCategoryResponse,
} from "@openrift/shared/types/api/admin";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { assertFound } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(adminCardTagsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The tags themselves are card data; only the tag → category mapping is
 * editable here.
 */
export const adminCardTagsRouter = {
  listCategories: os.listCategories.handler(
    async ({ context }): Promise<AdminTagCategoryListResponse> => {
      const { tagCategories: catRepo, tagDefinitions: defRepo } = context.repos;
      const [cats, defs] = await Promise.all([catRepo.listAll(), defRepo.listAll()]);
      const counts = new Map<string, number>();
      for (const def of defs) {
        counts.set(def.categoryId, (counts.get(def.categoryId) ?? 0) + 1);
      }
      return {
        categories: cats.map((cat): TagCategoryResponse => ({
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
    const { tagCategories: repo } = context.repos;
    const { slug, label, description } = input;
    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Category "${slug}" already exists`);
    }
    const maxSortOrder = await repo.getMaxSortOrder();
    const created = await repo.create({ slug, label, description, sortOrder: maxSortOrder + 1 });
    const category: TagCategoryResponse = {
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
    const { tagCategories: repo } = context.repos;
    const { id, ...body } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Tag category not found");
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
      }
    }
    await repo.update(id, body);
  }),

  removeCategory: os.removeCategory.handler(async ({ input, context }): Promise<void> => {
    const { tagCategories: repo } = context.repos;
    const { id } = input;
    const existing = await repo.getById(id);
    assertFound(existing, "Tag category not found");
    if (await repo.isInUse(id)) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Category is in use by one or more tags — reassign them first",
      );
    }
    await repo.deleteById(id);
  }),

  listTags: os.listTags.handler(async ({ context }): Promise<AdminCardTagListResponse> => {
    const { tagDefinitions: repo } = context.repos;
    const tags = await repo.distinctCardTags();
    return { tags };
  }),

  setTagCategory: os.setTagCategory.handler(async ({ input, context }): Promise<void> => {
    const { tagDefinitions: repo, tagCategories: catRepo } = context.repos;
    const { tag, categoryId } = input;
    if (categoryId !== null) {
      const category = await catRepo.getById(categoryId);
      if (!category) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown category id: ${categoryId}`);
      }
    }
    await repo.setCategory(tag, categoryId);
  }),

  detectLegendTags: os.detectLegendTags.handler(async ({ input, context }) => {
    const { tagDefinitions: repo, tagCategories: catRepo, catalog } = context.repos;
    const { categoryId } = input;
    const category = await catRepo.getById(categoryId);
    if (!category) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown category id: ${categoryId}`);
    }
    // Tags the admin already classified are left untouched.
    const allLegendTags = await catalog.championIdentifierTags();
    const legendTags = allLegendTags.filter((tag) => tag !== "" && tag === tag.trim());
    const assigned = await repo.classifyMissing(legendTags, categoryId);
    return { found: legendTags.length, assigned };
  }),
};
