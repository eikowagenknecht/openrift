import { ERROR_CODES } from "@openrift/shared";
import { adminSuperTypesContract } from "@openrift/shared/contracts/admin/super-types";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertSlugAvailable, assertValidReorder } from "../../lib/assertions.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminSuperTypesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin super type taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminSuperTypesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { superTypes: repo } = context.repos;
    const rows = await repo.listAll();
    return { superTypes: rows };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { superTypes: repo } = context.repos;
    const { slugs } = input;
    const all = await repo.listAll();
    assertValidReorder(slugs, all, {
      keyOf: (row) => row.slug,
      keyNoun: "slugs",
      unknownLabel: "supertype slugs",
    });
    await repo.reorder(slugs);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { superTypes: repo } = context.repos;
    const { slug, label } = input;

    const existing = await repo.getBySlug(slug);
    assertSlugAvailable(existing, slug, "Supertype");

    const created = await repo.create({ slug, label });
    return { superType: created };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { superTypes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Supertype "${input.slug}" not found`);
    }

    if (input.label) {
      await repo.update(input.slug, { label: input.label });
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { superTypes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Supertype "${input.slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known supertype");
    }

    const inUse = await repo.isInUse(input.slug);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: supertype is in use by one or more cards",
      );
    }

    await repo.deleteBySlug(input.slug);
  }),
};
