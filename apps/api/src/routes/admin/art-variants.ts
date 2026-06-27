import { ERROR_CODES } from "@openrift/shared";
import { adminArtVariantsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminArtVariantsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin art-variants taxonomy CRUD. Conflict / not-found / bad-request states
 * are thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminArtVariantsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { artVariants: repo } = context.repos;
    const rows = await repo.listAll();
    return { artVariants: rows };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { artVariants: repo } = context.repos;
    const { slugs } = input;

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allArtVariants = await repo.listAll();
    if (slugs.length !== allArtVariants.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allArtVariants.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allArtVariants.map((artVariant) => artVariant.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown art variant slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { artVariants: repo } = context.repos;
    const { slug, label } = input;

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Art variant "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
    return { artVariant: created };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { artVariants: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Art variant "${input.slug}" not found`);
    }

    if (input.label) {
      await repo.update(input.slug, { label: input.label });
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { artVariants: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Art variant "${input.slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known art variant");
    }

    const inUse = await repo.isInUse(input.slug);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: art variant is in use by one or more printings",
      );
    }

    await repo.deleteBySlug(input.slug);
  }),
};
