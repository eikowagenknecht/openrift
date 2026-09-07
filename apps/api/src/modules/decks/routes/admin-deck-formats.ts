import { adminDeckFormatsContract } from "@openrift/shared/contracts/admin/deck-formats";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { createSlugTaxonomyHandlers } from "../../catalog/lib/slug-taxonomy-router.js";

const os = implement(adminDeckFormatsContract).$context<ApiContext>().use(requireAuthedUser);

const handlers = createSlugTaxonomyHandlers({
  repoKey: "deckFormats",
  entityName: "Deck format",
  createKey: "deckFormat",
  inUseBy: "one or more decks",
});

export const adminDeckFormatsRouter = {
  list: os.list.handler(handlers.list),
  reorder: os.reorder.handler(handlers.reorder),
  create: os.create.handler(handlers.create),
  update: os.update.handler(handlers.update),
  remove: os.remove.handler(handlers.remove),
};
