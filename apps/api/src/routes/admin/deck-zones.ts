import { adminDeckZonesContract } from "@openrift/shared/contracts/admin/deck-zones";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertValidReorder } from "../../lib/assertions.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminDeckZonesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Deck zones are a fixed set, so only list / reorder / relabel are exposed.
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
    const all = await repo.listAll();
    assertValidReorder(slugs, all, {
      keyOf: (row) => row.slug,
      keyNoun: "slugs",
      unknownLabel: "deck zone slugs",
    });
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
