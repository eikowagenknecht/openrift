import { ERROR_CODES } from "@openrift/shared";
import { adminArtVariantsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertSlugAvailable, assertValidReorder } from "../../utils/assertions.js";

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
    const allArtVariants = await repo.listAll();
    assertValidReorder(slugs, allArtVariants, {
      keyOf: (row) => row.slug,
      keyNoun: "slugs",
      unknownLabel: "art variant slugs",
    });
    await repo.reorder(slugs);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { artVariants: repo } = context.repos;
    const { slug, label } = input;

    const existing = await repo.getBySlug(slug);
    assertSlugAvailable(existing, slug, "Art variant");

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
