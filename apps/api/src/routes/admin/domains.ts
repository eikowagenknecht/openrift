import { ERROR_CODES } from "@openrift/shared";
import { adminDomainsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminDomainsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin domain taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminDomainsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { domains: repo } = context.repos;
    const rows = await repo.listAll();
    return { domains: rows };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { domains: repo } = context.repos;
    const { slugs } = input;

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const all = await repo.listAll();
    if (slugs.length !== all.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${all.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(all.map((row) => row.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown domain slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { domains: repo } = context.repos;
    const { slug, label, color } = input;

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Domain "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label, color });
    return { domain: created };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { domains: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Domain "${input.slug}" not found`);
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
    const { domains: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Domain "${input.slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known domain");
    }

    const inUse = await repo.isInUse(input.slug);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: domain is in use by one or more cards",
      );
    }

    await repo.deleteBySlug(input.slug);
  }),
};
