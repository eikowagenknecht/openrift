import { adminArtVariantsContract } from "@openrift/shared/contracts/admin/art-variants";
import { implement } from "@orpc/server";

import { createSlugTaxonomyHandlers } from "../../lib/slug-taxonomy-router.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminArtVariantsContract).$context<ApiContext>().use(requireAuthedUser);

const handlers = createSlugTaxonomyHandlers({
  repoKey: "artVariants",
  entityName: "Art variant",
  createKey: "artVariant",
  inUseBy: "one or more printings",
});

export const adminArtVariantsRouter = {
  list: os.list.handler(handlers.list),
  reorder: os.reorder.handler(handlers.reorder),
  create: os.create.handler(handlers.create),
  update: os.update.handler(handlers.update),
  remove: os.remove.handler(handlers.remove),
};
