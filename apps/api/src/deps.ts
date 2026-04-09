import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { adminsRepo } from "./repositories/admins.js";
import { candidateCardsRepo } from "./repositories/candidate-cards.js";
import { candidateMutationsRepo } from "./repositories/candidate-mutations.js";
import { canonicalPrintingsRepo } from "./repositories/canonical-printings.js";
import { cardBansRepo } from "./repositories/card-bans.js";
import { catalogRepo } from "./repositories/catalog.js";
import { collectionEventsRepo } from "./repositories/collection-events.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { deckZonesRepo } from "./repositories/deck-zones.js";
import { decksRepo } from "./repositories/decks.js";
import { domainsRepo } from "./repositories/domains.js";
import { enumsRepo } from "./repositories/enums.js";
import { featureFlagsRepo } from "./repositories/feature-flags.js";
import { finishesRepo } from "./repositories/finishes.js";
import { healthRepo } from "./repositories/health.js";
import { ignoredCandidatesRepo } from "./repositories/ignored-candidates.js";
import { ingestRepo } from "./repositories/ingest.js";
import { keywordStylesRepo } from "./repositories/keyword-styles.js";
import { languagesRepo } from "./repositories/languages.js";
import { marketplaceAdminRepo } from "./repositories/marketplace-admin.js";
import { marketplaceMappingRepo } from "./repositories/marketplace-mapping.js";
import { marketplaceTransferRepo } from "./repositories/marketplace-transfer.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { priceRefreshRepo } from "./repositories/price-refresh.js";
import { printingEventsRepo } from "./repositories/printing-events.js";
import { printingImagesRepo } from "./repositories/printing-images.js";
import { promoTypesRepo } from "./repositories/promo-types.js";
import { providerSettingsRepo } from "./repositories/provider-settings.js";
import { rulesRepo } from "./repositories/rules.js";
import { setsRepo } from "./repositories/sets.js";
import { siteSettingsRepo } from "./repositories/site-settings.js";
import { statusRepo } from "./repositories/status.js";
import { tradeListsRepo } from "./repositories/trade-lists.js";
import { userFeatureFlagsRepo } from "./repositories/user-feature-flags.js";
import { userPreferencesRepo } from "./repositories/user-preferences.js";
import { usersRepo } from "./repositories/users.js";
import { wishListsRepo } from "./repositories/wish-lists.js";
import { deleteCollection } from "./services/collections.js";
import { addCopies, disposeCopies, moveCopies } from "./services/copies.js";
import { logEvents } from "./services/event-logger.js";
import { ensureInbox } from "./services/inbox.js";
import { ingestCandidates } from "./services/ingest-candidates.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";
import { buildShoppingList } from "./services/shopping-list.js";

export interface Repos {
  collectionEvents: ReturnType<typeof collectionEventsRepo>;
  admins: ReturnType<typeof adminsRepo>;
  cardBans: ReturnType<typeof cardBansRepo>;
  canonicalPrintings: ReturnType<typeof canonicalPrintingsRepo>;
  candidateMutations: ReturnType<typeof candidateMutationsRepo>;
  candidateCards: ReturnType<typeof candidateCardsRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  deckZones: ReturnType<typeof deckZonesRepo>;
  decks: ReturnType<typeof decksRepo>;
  domains: ReturnType<typeof domainsRepo>;
  enums: ReturnType<typeof enumsRepo>;
  featureFlags: ReturnType<typeof featureFlagsRepo>;
  finishes: ReturnType<typeof finishesRepo>;
  userFeatureFlags: ReturnType<typeof userFeatureFlagsRepo>;
  health: ReturnType<typeof healthRepo>;
  keywordStyles: ReturnType<typeof keywordStylesRepo>;
  languages: ReturnType<typeof languagesRepo>;
  ignoredCandidates: ReturnType<typeof ignoredCandidatesRepo>;
  marketplace: ReturnType<typeof marketplaceRepo>;
  marketplaceAdmin: ReturnType<typeof marketplaceAdminRepo>;
  printingImages: ReturnType<typeof printingImagesRepo>;
  promoTypes: ReturnType<typeof promoTypesRepo>;
  rules: ReturnType<typeof rulesRepo>;
  sets: ReturnType<typeof setsRepo>;
  status: ReturnType<typeof statusRepo>;
  providerSettings: ReturnType<typeof providerSettingsRepo>;
  siteSettings: ReturnType<typeof siteSettingsRepo>;
  tradeLists: ReturnType<typeof tradeListsRepo>;
  userPreferences: ReturnType<typeof userPreferencesRepo>;
  users: ReturnType<typeof usersRepo>;
  wishLists: ReturnType<typeof wishListsRepo>;
  ingest: ReturnType<typeof ingestRepo>;
  marketplaceMapping: ReturnType<typeof marketplaceMappingRepo>;
  marketplaceTransfer: ReturnType<typeof marketplaceTransferRepo>;
  priceRefresh: ReturnType<typeof priceRefreshRepo>;
  printingEvents: ReturnType<typeof printingEventsRepo>;
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
}

export function createRepos(db: Kysely<Database>): Repos {
  return {
    collectionEvents: collectionEventsRepo(db),
    admins: adminsRepo(db),
    cardBans: cardBansRepo(db),
    canonicalPrintings: canonicalPrintingsRepo(db),
    candidateMutations: candidateMutationsRepo(db),
    candidateCards: candidateCardsRepo(db),
    catalog: catalogRepo(db),
    collections: collectionsRepo(db),
    copies: copiesRepo(db),
    deckZones: deckZonesRepo(db),
    decks: decksRepo(db),
    domains: domainsRepo(db),
    enums: enumsRepo(db),
    featureFlags: featureFlagsRepo(db),
    finishes: finishesRepo(db),
    userFeatureFlags: userFeatureFlagsRepo(db),
    health: healthRepo(db),
    keywordStyles: keywordStylesRepo(db),
    languages: languagesRepo(db),
    ignoredCandidates: ignoredCandidatesRepo(db),
    marketplace: marketplaceRepo(db),
    marketplaceAdmin: marketplaceAdminRepo(db),
    printingImages: printingImagesRepo(db),
    promoTypes: promoTypesRepo(db),
    rules: rulesRepo(db),
    sets: setsRepo(db),
    status: statusRepo(db),
    providerSettings: providerSettingsRepo(db),
    siteSettings: siteSettingsRepo(db),
    tradeLists: tradeListsRepo(db),
    userPreferences: userPreferencesRepo(db),
    users: usersRepo(db),
    wishLists: wishListsRepo(db),
    ingest: ingestRepo(db),
    marketplaceMapping: marketplaceMappingRepo(db),
    marketplaceTransfer: marketplaceTransferRepo(db),
    priceRefresh: priceRefreshRepo(db),
    printingEvents: printingEventsRepo(db),
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
};
