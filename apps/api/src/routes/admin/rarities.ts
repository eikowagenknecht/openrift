import { ERROR_CODES } from "@openrift/shared";
import { adminRaritiesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertSlugAvailable, assertValidReorder } from "../../lib/assertions.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminRaritiesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin rarity taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminRaritiesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { rarities: repo } = context.repos;
    const rows = await repo.listAll();
    return { rarities: rows };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { rarities: repo } = context.repos;
    const { slugs } = input;
    const all = await repo.listAll();
    assertValidReorder(slugs, all, {
      keyOf: (row) => row.slug,
      keyNoun: "slugs",
      unknownLabel: "rarity slugs",
    });
    await repo.reorder(slugs);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { rarities: repo } = context.repos;
    const { slug, label, color } = input;

    const existing = await repo.getBySlug(slug);
    assertSlugAvailable(existing, slug, "Rarity");

    const created = await repo.create({ slug, label, color });
    return { rarity: created };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { rarities: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Rarity "${input.slug}" not found`);
    }

    const updates: { label?: string; color?: string | null } = {};
    if (input.label !== undefined) {
      updates.label = input.label;
    }
    if (input.color !== undefined) {
      updates.color = input.color;
    }

    if (Object.keys(updates).length > 0) {
      await repo.update(input.slug, updates);
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { rarities: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Rarity "${input.slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known rarity");
    }

    const inUse = await repo.isInUse(input.slug);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: rarity is in use by one or more printings",
      );
    }

    await repo.deleteBySlug(input.slug);
  }),
};
