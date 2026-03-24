import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { acquisitionSourcesRepo } from "./repositories/acquisition-sources.js";
import { activitiesRepo } from "./repositories/activities.js";
import { adminsRepo } from "./repositories/admins.js";
import { candidateCardsRepo } from "./repositories/candidate-cards.js";
import { candidateMutationsRepo } from "./repositories/candidate-mutations.js";
import { catalogRepo } from "./repositories/catalog.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { decksRepo } from "./repositories/decks.js";
import { featureFlagsRepo } from "./repositories/feature-flags.js";
import { healthRepo } from "./repositories/health.js";
import { ignoredCandidatesRepo } from "./repositories/ignored-candidates.js";
import { ingestRepo } from "./repositories/ingest.js";
import { keywordStylesRepo } from "./repositories/keyword-styles.js";
import { marketplaceAdminRepo } from "./repositories/marketplace-admin.js";
import { marketplaceMappingRepo } from "./repositories/marketplace-mapping.js";
import { marketplaceTransferRepo } from "./repositories/marketplace-transfer.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { priceRefreshRepo } from "./repositories/price-refresh.js";
import { printingImagesRepo } from "./repositories/printing-images.js";
import { promoTypesRepo } from "./repositories/promo-types.js";
import { providerSettingsRepo } from "./repositories/provider-settings.js";
import { setsRepo } from "./repositories/sets.js";
import { tradeListsRepo } from "./repositories/trade-lists.js";
import { wishListsRepo } from "./repositories/wish-lists.js";
import { createActivity } from "./services/activity-logger.js";
import { deleteCollection } from "./services/collections.js";
import { addCopies, disposeCopies, moveCopies } from "./services/copies.js";
import { ensureInbox } from "./services/inbox.js";
import { ingestCandidates } from "./services/ingest-candidates.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";
import { buildShoppingList } from "./services/shopping-list.js";

export interface Repos {
  activities: ReturnType<typeof activitiesRepo>;
  admins: ReturnType<typeof adminsRepo>;
  candidateMutations: ReturnType<typeof candidateMutationsRepo>;
  candidateCards: ReturnType<typeof candidateCardsRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  decks: ReturnType<typeof decksRepo>;
  featureFlags: ReturnType<typeof featureFlagsRepo>;
  health: ReturnType<typeof healthRepo>;
  keywordStyles: ReturnType<typeof keywordStylesRepo>;
  ignoredCandidates: ReturnType<typeof ignoredCandidatesRepo>;
  marketplace: ReturnType<typeof marketplaceRepo>;
  marketplaceAdmin: ReturnType<typeof marketplaceAdminRepo>;
  printingImages: ReturnType<typeof printingImagesRepo>;
  promoTypes: ReturnType<typeof promoTypesRepo>;
  sets: ReturnType<typeof setsRepo>;
  providerSettings: ReturnType<typeof providerSettingsRepo>;
  acquisitionSources: ReturnType<typeof acquisitionSourcesRepo>;
  tradeLists: ReturnType<typeof tradeListsRepo>;
  wishLists: ReturnType<typeof wishListsRepo>;
  ingest: ReturnType<typeof ingestRepo>;
  marketplaceMapping: ReturnType<typeof marketplaceMappingRepo>;
  marketplaceTransfer: ReturnType<typeof marketplaceTransferRepo>;
  priceRefresh: ReturnType<typeof priceRefreshRepo>;
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
  ingestCandidates: typeof ingestCandidates;
}

export function createRepos(db: Kysely<Database>): Repos {
  return {
    activities: activitiesRepo(db),
    admins: adminsRepo(db),
    candidateMutations: candidateMutationsRepo(db),
    candidateCards: candidateCardsRepo(db),
    catalog: catalogRepo(db),
    collections: collectionsRepo(db),
    copies: copiesRepo(db),
    decks: decksRepo(db),
    featureFlags: featureFlagsRepo(db),
    health: healthRepo(db),
    keywordStyles: keywordStylesRepo(db),
    ignoredCandidates: ignoredCandidatesRepo(db),
    marketplace: marketplaceRepo(db),
    marketplaceAdmin: marketplaceAdminRepo(db),
    printingImages: printingImagesRepo(db),
    promoTypes: promoTypesRepo(db),
    sets: setsRepo(db),
    providerSettings: providerSettingsRepo(db),
    acquisitionSources: acquisitionSourcesRepo(db),
    tradeLists: tradeListsRepo(db),
    wishLists: wishListsRepo(db),
    ingest: ingestRepo(db),
    marketplaceMapping: marketplaceMappingRepo(db),
    marketplaceTransfer: marketplaceTransferRepo(db),
    priceRefresh: priceRefreshRepo(db),
  };
}

export type Transact = <T>(fn: (repos: Repos) => Promise<T>) => Promise<T>;

export function createTransact(db: Kysely<Database>): Transact {
  return <T>(fn: (repos: Repos) => Promise<T>) =>
    db.transaction().execute((trx) => fn(createRepos(trx)));
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
  ingestCandidates,
};
