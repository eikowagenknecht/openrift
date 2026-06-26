import { ERROR_CODES } from "@openrift/shared";
import { adminSuperTypesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminSuperTypesContract).$context<ApiContext>().use(requireUser);

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
        `Unknown super type slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { superTypes: repo } = context.repos;
    const { slug, label } = input;

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Super type "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
    return { superType: created };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { superTypes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Super type "${input.slug}" not found`);
    }

    if (input.label) {
      await repo.update(input.slug, { label: input.label });
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { superTypes: repo } = context.repos;

    const existing = await repo.getBySlug(input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Super type "${input.slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known super type");
    }

    const inUse = await repo.isInUse(input.slug);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: super type is in use by one or more cards",
      );
    }

    await repo.deleteBySlug(input.slug);
  }),
};
