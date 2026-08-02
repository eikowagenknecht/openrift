import { ERROR_CODES } from "@openrift/shared";
import { adminCardTypesContract } from "@openrift/shared/contracts/admin/card-types";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertSlugAvailable, assertValidReorder } from "../../lib/assertions.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminCardTypesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin card type taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminCardTypesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { cardTypes: repo } = context.repos;
    const rows = await repo.listAll();
    return { cardTypes: rows };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { cardTypes: repo } = context.repos;
    const { slugs } = input;
    const all = await repo.listAll();
    assertValidReorder(slugs, all, {
      keyOf: (row) => row.slug,
      keyNoun: "slugs",
      unknownLabel: "card type slugs",
    });
    await repo.reorder(slugs);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { cardTypes: repo } = context.repos;
    const { slug, label } = input;

    const existing = await repo.getBySlug(slug);
    assertSlugAvailable(existing, slug, "Card type");

    const created = await repo.create({ slug, label });
    return { cardType: created };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { cardTypes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Card type "${input.slug}" not found`);
    }

    if (input.label) {
      await repo.update(input.slug, { label: input.label });
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { cardTypes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Card type "${input.slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known card type");
    }

    const inUse = await repo.isInUse(input.slug);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: card type is in use by one or more cards",
      );
    }

    await repo.deleteBySlug(input.slug);
  }),
};
