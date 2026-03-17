import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { activitiesRepo } from "./repositories/activities.js";
import { cardSourcesRepo } from "./repositories/card-sources.js";
import { catalogRepo } from "./repositories/catalog.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { decksRepo } from "./repositories/decks.js";
import { featureFlagsRepo } from "./repositories/feature-flags.js";
import { ignoredSourcesRepo } from "./repositories/ignored-sources.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { sourcesRepo } from "./repositories/sources.js";
import { tradeListsRepo } from "./repositories/trade-lists.js";
import { wishListsRepo } from "./repositories/wish-lists.js";
import { createActivity } from "./services/activity-logger.js";
import { addCopies, disposeCopies, moveCopies } from "./services/copies.js";
import { ensureInbox } from "./services/inbox.js";
import { ingestCardSources } from "./services/ingest-card-sources.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";
import { buildShoppingList } from "./services/shopping-list.js";

export interface Repos {
  activities: ReturnType<typeof activitiesRepo>;
  cardSources: ReturnType<typeof cardSourcesRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  decks: ReturnType<typeof decksRepo>;
  featureFlags: ReturnType<typeof featureFlagsRepo>;
  ignoredSources: ReturnType<typeof ignoredSourcesRepo>;
  marketplace: ReturnType<typeof marketplaceRepo>;
  sources: ReturnType<typeof sourcesRepo>;
  tradeLists: ReturnType<typeof tradeListsRepo>;
  wishLists: ReturnType<typeof wishListsRepo>;
}

export interface Services {
  ensureInbox: typeof ensureInbox;
  createActivity: typeof createActivity;
  addCopies: typeof addCopies;
  moveCopies: typeof moveCopies;
  disposeCopies: typeof disposeCopies;
  buildShoppingList: typeof buildShoppingList;
  getMappingOverview: typeof getMappingOverview;
  ingestCardSources: typeof ingestCardSources;
}

export function createRepos(db: Kysely<Database>): Repos {
  return {
    activities: activitiesRepo(db),
    cardSources: cardSourcesRepo(db),
    catalog: catalogRepo(db),
    collections: collectionsRepo(db),
    copies: copiesRepo(db),
    decks: decksRepo(db),
    featureFlags: featureFlagsRepo(db),
    ignoredSources: ignoredSourcesRepo(db),
    marketplace: marketplaceRepo(db),
    sources: sourcesRepo(db),
    tradeLists: tradeListsRepo(db),
    wishLists: wishListsRepo(db),
  };
}

export const services: Services = {
  ensureInbox,
  createActivity,
  addCopies,
  moveCopies,
  disposeCopies,
  buildShoppingList,
  getMappingOverview,
  ingestCardSources,
};
