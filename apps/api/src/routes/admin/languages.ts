import { ERROR_CODES } from "@openrift/shared";
import type { LanguageResponse } from "@openrift/shared";
import { adminLanguagesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertFound } from "../../utils/assertions.js";

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

    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== codes.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate language codes in reorder list.");
    }

    const allLangs = await repo.listAll();
    if (codes.length !== allLangs.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allLangs.length} language codes, got ${codes.length}.`,
      );
    }

    const knownCodes = new Set(allLangs.map((lang) => lang.code));
    const unknown = codes.filter((code) => !knownCodes.has(code));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown language codes: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(codes);
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { languages: repo } = context.repos;
    const { code, name, sortOrder } = input;

    const existing = await repo.getByCode(code);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Language "${code}" already exists`);
    }

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
