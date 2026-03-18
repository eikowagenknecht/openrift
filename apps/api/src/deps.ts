import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { activitiesRepo } from "./repositories/activities.js";
import { adminsRepo } from "./repositories/admins.js";
import { cardSourceMutationsRepo } from "./repositories/card-source-mutations.js";
import { cardSourcesRepo } from "./repositories/card-sources.js";
import { catalogRepo } from "./repositories/catalog.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { decksRepo } from "./repositories/decks.js";
import { featureFlagsRepo } from "./repositories/feature-flags.js";
import { ignoredSourcesRepo } from "./repositories/ignored-sources.js";
import { marketplaceAdminRepo } from "./repositories/marketplace-admin.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { printingImagesRepo } from "./repositories/printing-images.js";
import { promoTypesRepo } from "./repositories/promo-types.js";
import { setsRepo } from "./repositories/sets.js";
import { sourcesRepo } from "./repositories/sources.js";
import { tradeListsRepo } from "./repositories/trade-lists.js";
import { wishListsRepo } from "./repositories/wish-lists.js";
import { createActivity } from "./services/activity-logger.js";
import { deleteCollection } from "./services/collections.js";
import { addCopies, disposeCopies, moveCopies } from "./services/copies.js";
import { ensureInbox } from "./services/inbox.js";
import { ingestCardSources } from "./services/ingest-card-sources.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";
import { buildShoppingList } from "./services/shopping-list.js";

export interface Repos {
  activities: ReturnType<typeof activitiesRepo>;
  admins: ReturnType<typeof adminsRepo>;
  cardSourceMutations: ReturnType<typeof cardSourceMutationsRepo>;
  cardSources: ReturnType<typeof cardSourcesRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  decks: ReturnType<typeof decksRepo>;
  featureFlags: ReturnType<typeof featureFlagsRepo>;
  ignoredSources: ReturnType<typeof ignoredSourcesRepo>;
  marketplace: ReturnType<typeof marketplaceRepo>;
  marketplaceAdmin: ReturnType<typeof marketplaceAdminRepo>;
  printingImages: ReturnType<typeof printingImagesRepo>;
  promoTypes: ReturnType<typeof promoTypesRepo>;
  sets: ReturnType<typeof setsRepo>;
  sources: ReturnType<typeof sourcesRepo>;
  tradeLists: ReturnType<typeof tradeListsRepo>;
  wishLists: ReturnType<typeof wishListsRepo>;
}

export interface Services {
  ensureInbox: typeof ensureInbox;
  createActivity: typeof createActivity;
  deleteCollection: typeof deleteCollection;
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
    admins: adminsRepo(db),
    cardSourceMutations: cardSourceMutationsRepo(db),
    cardSources: cardSourcesRepo(db),
    catalog: catalogRepo(db),
    collections: collectionsRepo(db),
    copies: copiesRepo(db),
    decks: decksRepo(db),
    featureFlags: featureFlagsRepo(db),
    ignoredSources: ignoredSourcesRepo(db),
    marketplace: marketplaceRepo(db),
    marketplaceAdmin: marketplaceAdminRepo(db),
    printingImages: printingImagesRepo(db),
    promoTypes: promoTypesRepo(db),
    sets: setsRepo(db),
    sources: sourcesRepo(db),
    tradeLists: tradeListsRepo(db),
    wishLists: wishListsRepo(db),
  };
}

export const services: Services = {
  ensureInbox,
  createActivity,
  deleteCollection,
  addCopies,
  moveCopies,
  disposeCopies,
  buildShoppingList,
  getMappingOverview,
  ingestCardSources,
};
