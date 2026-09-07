import { adminDomainsContract } from "@openrift/shared/contracts/admin/domains";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { createSlugTaxonomyHandlers } from "../lib/slug-taxonomy-router.js";

const os = implement(adminDomainsContract).$context<ApiContext>().use(requireAuthedUser);

const handlers = createSlugTaxonomyHandlers({
  repoKey: "domains",
  entityName: "Domain",
  createKey: "domain",
  inUseBy: "one or more cards",
  hasColor: true,
});

export const adminDomainsRouter = {
  list: os.list.handler(handlers.list),
  reorder: os.reorder.handler(handlers.reorder),
  create: os.create.handler(handlers.create),
  update: os.update.handler(handlers.update),
  remove: os.remove.handler(handlers.remove),
};
