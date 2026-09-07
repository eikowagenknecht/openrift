import { adminFinishesContract } from "@openrift/shared/contracts/admin/finishes";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { createSlugTaxonomyHandlers } from "../lib/slug-taxonomy-router.js";

const os = implement(adminFinishesContract).$context<ApiContext>().use(requireAuthedUser);

const handlers = createSlugTaxonomyHandlers({
  repoKey: "finishes",
  entityName: "Finish",
  createKey: "finish",
  inUseBy: "one or more printings",
  afterReorder: async (context) => {
    // finish.sort_order feeds canonical_rank.
    await context.repos.catalog.refreshCanonicalRank();
  },
});

export const adminFinishesRouter = {
  list: os.list.handler(handlers.list),
  reorder: os.reorder.handler(handlers.reorder),
  create: os.create.handler(handlers.create),
  update: os.update.handler(handlers.update),
  remove: os.remove.handler(handlers.remove),
};
