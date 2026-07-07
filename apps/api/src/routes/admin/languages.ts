import { ERROR_CODES } from "@openrift/shared";
import type { LanguageResponse } from "@openrift/shared";
import { adminLanguagesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertFound, assertSlugAvailable, assertValidReorder } from "../../utils/assertions.js";

const os = implement(adminLanguagesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin languages taxonomy CRUD. Languages are keyed by their `code`. Conflict
 * / not-found / in-use states are thrown as `AppError` and mapped by the
 * handler's {@link appErrorInterceptor}.
 */
export const adminLanguagesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { languages: repo } = context.repos;
    const rows = await repo.listAll();
    return {
      languages: rows.map(
        (r): LanguageResponse => ({
          code: r.code,
          name: r.name,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { languages: repo } = context.repos;
    const { codes } = input;
    const allLangs = await repo.listAll();
    assertValidReorder(codes, allLangs, {
      keyOf: (lang) => lang.code,
      keyNoun: "language codes",
      unknownLabel: "language codes",
    });
    await repo.reorder(codes);
    // Language sort_order feeds the printing canonical rank (migration 195).
    await context.repos.catalog.recomputeCanonicalRanks();
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { languages: repo } = context.repos;
    const { code, name, sortOrder } = input;

    const existing = await repo.getByCode(code);
    assertSlugAvailable(existing, code, "Language");

    const created = await repo.create({ code, name, sortOrder });
    const language: LanguageResponse = {
      code: created.code,
      name: created.name,
      sortOrder: created.sortOrder,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
    return { language };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { languages: repo } = context.repos;
    const { code, name, sortOrder } = input;

    const existing = await repo.getByCode(code);
    assertFound(existing, `Language not found`);

    await repo.update(code, { name, sortOrder });
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { languages: repo } = context.repos;
    const { code } = input;

    const existing = await repo.getByCode(code);
    assertFound(existing, `Language not found`);

    const inUse = await repo.isInUse(code);
    if (inUse) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Cannot delete: language is in use by one or more printings",
      );
    }

    await repo.deleteByCode(code);
  }),
};
