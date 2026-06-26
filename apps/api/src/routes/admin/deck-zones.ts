import { ERROR_CODES } from "@openrift/shared";
import { adminDeckZonesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminDeckZonesContract).$context<ApiContext>().use(requireUser);

/**
 * Admin deck-zones taxonomy. Deck zones are a fixed set, so only list /
 * reorder / relabel are exposed. Not-found / bad-request states are thrown as
 * `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminDeckZonesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { deckZones: repo } = context.repos;
    const rows = await repo.listAll();
    return { deckZones: rows };
  }),

  reorder: os.reorder.handler(async ({ input, context }): Promise<void> => {
    const { deckZones: repo } = context.repos;
    const { slugs } = input;

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allZones = await repo.listAll();
    if (slugs.length !== allZones.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allZones.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allZones.map((zone) => zone.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown deck zone slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { deckZones: repo } = context.repos;

    const allZones = await repo.listAll();
    const existing = allZones.find((zone) => zone.slug === input.slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Deck zone "${input.slug}" not found`);
    }

    if (input.label) {
      await repo.update(input.slug, { label: input.label });
    }
  }),
};
