import { ERROR_CODES } from "@openrift/shared";
import { adminFinishesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertSlugAvailable, assertValidReorder } from "../../utils/assertions.js";

const os = implement(adminFinishesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin finish taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminFinishesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { finishes: repo } = context.repos;
    const rows = await repo.listAll();
    return { finishes: rows };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { finishes: repo } = context.repos;
    const { slugs } = input;
    const all = await repo.listAll();
    assertValidReorder(slugs, all, {
      keyOf: (row) => row.slug,
      keyNoun: "slugs",
      unknownLabel: "finish slugs",
    });
    await repo.reorder(slugs);
    // Finish sort_order feeds the printing canonical rank (migration 195).
    await context.repos.catalog.recomputeCanonicalRanks();
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { finishes: repo } = context.repos;
    const { slug, label } = input;

    const existing = await repo.getBySlug(slug);
    assertSlugAvailable(existing, slug, "Finish");

    const created = await repo.create({ slug, label });
    return { finish: created };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { finishes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Finish "${input.slug}" not found`);
    }

    if (input.label) {
      await repo.update(input.slug, { label: input.label });
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { finishes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Finish "${input.slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known finish");
    }

    const inUse = await repo.isInUse(input.slug);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: finish is in use by one or more printings",
      );
    }

    await repo.deleteBySlug(input.slug);
  }),
};
