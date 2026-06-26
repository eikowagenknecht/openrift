import { ERROR_CODES } from "@openrift/shared";
import { adminCatalogContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminCatalogContract).$context<ApiContext>().use(requireUser);

/**
 * Admin set (catalog) management. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminCatalogRouter = {
  listSets: os.listSets.handler(async ({ context }) => {
    const { sets: setsRepo } = context.repos;

    const [sets, cardCounts, printingCounts] = await Promise.all([
      setsRepo.listAll(),
      setsRepo.cardCountsBySet(),
      setsRepo.printingCountsBySet(),
    ]);

    const cardCountMap = new Map(cardCounts.map((r) => [r.setId, r.cardCount]));
    const printingCountMap = new Map(printingCounts.map((r) => [r.setId, r.printingCount]));

    return {
      sets: sets.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        printedTotal: s.printedTotal,
        sortOrder: s.sortOrder,
        releasedAt: s.releasedAt,
        released: s.released,
        setType: s.setType,
        cardCount: cardCountMap.get(s.id) ?? 0,
        printingCount: printingCountMap.get(s.id) ?? 0,
      })),
    };
  }),

  updateSet: os.updateSet.handler(async ({ input, context }): Promise<void> => {
    const { sets: setsRepo } = context.repos;
    const { id, name, printedTotal, releasedAt, released, setType } = input;

    const updated = await setsRepo.update(id, {
      name,
      printedTotal,
      releasedAt,
      released,
      setType,
    });
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Set "${id}" not found`);
    }
  }),

  createSet: os.createSet.handler(async ({ input, context }) => {
    const { sets: setsRepo } = context.repos;
    const { id, name, printedTotal, releasedAt } = input;

    const setId = await setsRepo.createIfNotExists({ slug: id, name, printedTotal, releasedAt });
    if (!setId) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Set with ID "${id}" already exists`);
    }

    return { id: setId };
  }),

  deleteSet: os.deleteSet.handler(async ({ input, context }): Promise<void> => {
    const { sets: setsRepo } = context.repos;
    const { id } = input;

    const printingCount = await setsRepo.printingCount(id);
    if (printingCount > 0) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `Cannot delete set "${id}" — it still has ${printingCount} printing(s). Remove them first.`,
      );
    }

    await setsRepo.deleteById(id);
  }),

  reorderSets: os.reorderSets.handler(async ({ input, context }): Promise<void> => {
    const { sets: setsRepo } = context.repos;
    const { ids } = input;

    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate set IDs in reorder list.");
    }

    const allSets = await setsRepo.listAll();
    if (ids.length !== allSets.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allSets.length} set IDs but received ${ids.length}. All sets must be included in the reorder.`,
      );
    }

    const knownIds = new Set(allSets.map((s) => s.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Unknown set IDs: ${unknown.join(", ")}`);
    }

    await setsRepo.reorder(ids);
  }),
};
