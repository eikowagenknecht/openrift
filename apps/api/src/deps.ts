import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { adminsRepo } from "./repositories/admins.js";
import { artVariantsRepo } from "./repositories/art-variants.js";
import { candidateCardsRepo } from "./repositories/candidate-cards.js";
import { candidateMutationsRepo } from "./repositories/candidate-mutations.js";
import { canonicalPrintingsRepo } from "./repositories/canonical-printings.js";
import { cardBansRepo } from "./repositories/card-bans.js";
import { cardTypesRepo } from "./repositories/card-types.js";
import { catalogRepo } from "./repositories/catalog.js";
import { collectionEventsRepo } from "./repositories/collection-events.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { deckFormatsRepo } from "./repositories/deck-formats.js";
import { deckZonesRepo } from "./repositories/deck-zones.js";
import { decksRepo } from "./repositories/decks.js";
import { distributionChannelsRepo } from "./repositories/distribution-channels.js";
import { domainsRepo } from "./repositories/domains.js";
import { enumsRepo } from "./repositories/enums.js";
import { featureFlagsRepo } from "./repositories/feature-flags.js";
import { finishesRepo } from "./repositories/finishes.js";
import { healthRepo } from "./repositories/health.js";
import { ignoredCandidatesRepo } from "./repositories/ignored-candidates.js";
import { ingestRepo } from "./repositories/ingest.js";
import { jobRunsRepo } from "./repositories/job-runs.js";
import { keywordsRepo } from "./repositories/keywords.js";
import { languagesRepo } from "./repositories/languages.js";
import { markersRepo } from "./repositories/markers.js";
import { marketplaceAdminRepo } from "./repositories/marketplace-admin.js";
import { marketplaceMappingRepo } from "./repositories/marketplace-mapping.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { priceRefreshRepo } from "./repositories/price-refresh.js";
import { printingEventsRepo } from "./repositories/printing-events.js";
import { printingImagesRepo } from "./repositories/printing-images.js";
import { providerSettingsRepo } from "./repositories/provider-settings.js";
import { raritiesRepo } from "./repositories/rarities.js";
import { rulesRepo } from "./repositories/rules.js";
import { setsRepo } from "./repositories/sets.js";
import { siteSettingsRepo } from "./repositories/site-settings.js";
import { statusRepo } from "./repositories/status.js";
import { superTypesRepo } from "./repositories/super-types.js";
import { tradeListsRepo } from "./repositories/trade-lists.js";
import { userFeatureFlagsRepo } from "./repositories/user-feature-flags.js";
import { userPreferencesRepo } from "./repositories/user-preferences.js";
import { usersRepo } from "./repositories/users.js";
import { wishListsRepo } from "./repositories/wish-lists.js";
import { deleteCollection } from "./services/collections.js";
import { addCopies, disposeCopies, moveCopies } from "./services/copies.js";
import { logEvents } from "./services/event-logger.js";
import { importErrata } from "./services/import-errata.js";
import { ensureInbox } from "./services/inbox.js";
import { ingestCandidates } from "./services/ingest-candidates.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";
import { buildShoppingList } from "./services/shopping-list.js";

export interface Repos {
  collectionEvents: ReturnType<typeof collectionEventsRepo>;
  admins: ReturnType<typeof adminsRepo>;
  artVariants: ReturnType<typeof artVariantsRepo>;
  cardBans: ReturnType<typeof cardBansRepo>;
  cardTypes: ReturnType<typeof cardTypesRepo>;
  canonicalPrintings: ReturnType<typeof canonicalPrintingsRepo>;
  candidateMutations: ReturnType<typeof candidateMutationsRepo>;
  candidateCards: ReturnType<typeof candidateCardsRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  deckFormats: ReturnType<typeof deckFormatsRepo>;
  deckZones: ReturnType<typeof deckZonesRepo>;
  decks: ReturnType<typeof decksRepo>;
  domains: ReturnType<typeof domainsRepo>;
  enums: ReturnType<typeof enumsRepo>;
  featureFlags: ReturnType<typeof featureFlagsRepo>;
  finishes: ReturnType<typeof finishesRepo>;
  userFeatureFlags: ReturnType<typeof userFeatureFlagsRepo>;
  health: ReturnType<typeof healthRepo>;
  keywords: ReturnType<typeof keywordsRepo>;
  languages: ReturnType<typeof languagesRepo>;
  ignoredCandidates: ReturnType<typeof ignoredCandidatesRepo>;
  marketplace: ReturnType<typeof marketplaceRepo>;
  marketplaceAdmin: ReturnType<typeof marketplaceAdminRepo>;
  printingImages: ReturnType<typeof printingImagesRepo>;
  markers: ReturnType<typeof markersRepo>;
  distributionChannels: ReturnType<typeof distributionChannelsRepo>;
  rarities: ReturnType<typeof raritiesRepo>;
  rules: ReturnType<typeof rulesRepo>;
  sets: ReturnType<typeof setsRepo>;
  status: ReturnType<typeof statusRepo>;
  superTypes: ReturnType<typeof superTypesRepo>;
  providerSettings: ReturnType<typeof providerSettingsRepo>;
  siteSettings: ReturnType<typeof siteSettingsRepo>;
  tradeLists: ReturnType<typeof tradeListsRepo>;
  userPreferences: ReturnType<typeof userPreferencesRepo>;
  users: ReturnType<typeof usersRepo>;
  wishLists: ReturnType<typeof wishListsRepo>;
  ingest: ReturnType<typeof ingestRepo>;
  marketplaceMapping: ReturnType<typeof marketplaceMappingRepo>;
  priceRefresh: ReturnType<typeof priceRefreshRepo>;
  printingEvents: ReturnType<typeof printingEventsRepo>;
  jobRuns: ReturnType<typeof jobRunsRepo>;
}

export interface Services {
  ensureInbox: typeof ensureInbox;
  logEvents: typeof logEvents;
  deleteCollection: typeof deleteCollection;
  addCopies: typeof addCopies;
  moveCopies: typeof moveCopies;
  disposeCopies: typeof disposeCopies;
  buildShoppingList: typeof buildShoppingList;
  getMappingOverview: typeof getMappingOverview;
  ingestCandidates: typeof ingestCandidates;
  importErrata: typeof importErrata;
}

export function createRepos(db: Kysely<Database>): Repos {
  return {
    collectionEvents: collectionEventsRepo(db),
    admins: adminsRepo(db),
    artVariants: artVariantsRepo(db),
    cardBans: cardBansRepo(db),
    cardTypes: cardTypesRepo(db),
    canonicalPrintings: canonicalPrintingsRepo(db),
    candidateMutations: candidateMutationsRepo(db),
    candidateCards: candidateCardsRepo(db),
    catalog: catalogRepo(db),
    collections: collectionsRepo(db),
    copies: copiesRepo(db),
    deckFormats: deckFormatsRepo(db),
    deckZones: deckZonesRepo(db),
    decks: decksRepo(db),
    domains: domainsRepo(db),
    enums: enumsRepo(db),
    featureFlags: featureFlagsRepo(db),
    finishes: finishesRepo(db),
    userFeatureFlags: userFeatureFlagsRepo(db),
    health: healthRepo(db),
    keywords: keywordsRepo(db),
    languages: languagesRepo(db),
    ignoredCandidates: ignoredCandidatesRepo(db),
    marketplace: marketplaceRepo(db),
    marketplaceAdmin: marketplaceAdminRepo(db),
    printingImages: printingImagesRepo(db),
    markers: markersRepo(db),
    distributionChannels: distributionChannelsRepo(db),
    rarities: raritiesRepo(db),
    rules: rulesRepo(db),
    sets: setsRepo(db),
    status: statusRepo(db),
    superTypes: superTypesRepo(db),
    providerSettings: providerSettingsRepo(db),
    siteSettings: siteSettingsRepo(db),
    tradeLists: tradeListsRepo(db),
    userPreferences: userPreferencesRepo(db),
    users: usersRepo(db),
    wishLists: wishListsRepo(db),
    ingest: ingestRepo(db),
    marketplaceMapping: marketplaceMappingRepo(db),
    priceRefresh: priceRefreshRepo(db),
    printingEvents: printingEventsRepo(db),
    jobRuns: jobRunsRepo(db),
  };
}

export type Transact = <T>(fn: (repos: Repos) => Promise<T>) => Promise<T>;

export function createTransact(db: Kysely<Database>): Transact {
  return <T>(fn: (repos: Repos) => Promise<T>) =>
    db.transaction().execute((trx) => fn(createRepos(trx)));
}

export const services: Services = {
  ensureInbox,
  logEvents,
  deleteCollection,
  addCopies,
  moveCopies,
  disposeCopies,
  buildShoppingList,
  getMappingOverview,
  ingestCandidates,
  importErrata,
};
