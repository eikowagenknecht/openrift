import { adminCardTypesContract } from "@openrift/shared/contracts/admin/card-types";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { createSlugTaxonomyHandlers } from "../lib/slug-taxonomy-router.js";

const os = implement(adminCardTypesContract).$context<ApiContext>().use(requireAuthedUser);

const handlers = createSlugTaxonomyHandlers({
  repoKey: "cardTypes",
  entityName: "Card type",
  createKey: "cardType",
  inUseBy: "one or more cards",
});

/**
 * Admin card type taxonomy CRUD. Conflict / not-found / bad-request states are
 * thrown as `AppError` and mapped by the handler's appErrorInterceptor.
 */
export const adminCardTypesRouter = {
  list: os.list.handler(handlers.list),
  reorder: os.reorder.handler(handlers.reorder),
  create: os.create.handler(handlers.create),
  update: os.update.handler(handlers.update),
  remove: os.remove.handler(handlers.remove),
};
