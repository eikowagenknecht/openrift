import { adminFinishesContract } from "@openrift/shared/contracts/admin/finishes";
import { implement } from "@orpc/server";

import { createSlugTaxonomyHandlers } from "../../lib/slug-taxonomy-router.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminFinishesContract).$context<ApiContext>().use(requireAuthedUser);

const handlers = createSlugTaxonomyHandlers({
  repoKey: "finishes",
  entityName: "Finish",
  createKey: "finish",
  inUseBy: "one or more printings",
  afterReorder: async (context) => {
    // finish.sort_order feeds canonical_rank (migration 215).
    await context.repos.catalog.refreshCanonicalRank();
  },
});

/**
 * Admin finish taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminFinishesRouter = {
  list: os.list.handler(handlers.list),
  reorder: os.reorder.handler(handlers.reorder),
  create: os.create.handler(handlers.create),
  update: os.update.handler(handlers.update),
  remove: os.remove.handler(handlers.remove),
};
