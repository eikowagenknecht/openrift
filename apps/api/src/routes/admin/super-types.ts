import { adminSuperTypesContract } from "@openrift/shared/contracts/admin/super-types";
import { implement } from "@orpc/server";

import { createSlugTaxonomyHandlers } from "../../lib/slug-taxonomy-router.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminSuperTypesContract).$context<ApiContext>().use(requireAuthedUser);

const handlers = createSlugTaxonomyHandlers({
  repoKey: "superTypes",
  entityName: "Supertype",
  createKey: "superType",
  inUseBy: "one or more cards",
});

/**
 * Admin super type taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminSuperTypesRouter = {
  list: os.list.handler(handlers.list),
  reorder: os.reorder.handler(handlers.reorder),
  create: os.create.handler(handlers.create),
  update: os.update.handler(handlers.update),
  remove: os.remove.handler(handlers.remove),
};
