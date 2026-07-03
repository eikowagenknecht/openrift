import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { instrumentRepo } from "./db/instrumented-repo.js";
import { adminsRepo } from "./repositories/admins.js";
import { artVariantsRepo } from "./repositories/art-variants.js";
import { candidateCardsRepo } from "./repositories/candidate-cards.js";
import { candidateMutationsRepo } from "./repositories/candidate-mutations.js";
import { canonicalPrintingsRepo } from "./repositories/canonical-printings.js";
import { cardBansRepo } from "./repositories/card-bans.js";
import { cardTradesRepo } from "./repositories/card-trades.js";
import { cardTypesRepo } from "./repositories/card-types.js";
import { catalogRepo } from "./repositories/catalog.js";
import { collectionDeckbuildingPrefsRepo } from "./repositories/collection-deckbuilding-prefs.js";
import { collectionEventsRepo } from "./repositories/collection-events.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { customTagCategoriesRepo } from "./repositories/custom-tag-categories.js";
import { customTagsRepo } from "./repositories/custom-tags.js";
import { deckCheckRepo } from "./repositories/deck-check.js";
import { deckFormatsRepo } from "./repositories/deck-formats.js";
import { deckPlansRepo } from "./repositories/deck-plans.js";
import { deckZonesRepo } from "./repositories/deck-zones.js";
import { decksRepo } from "./repositories/decks.js";
import { distributionChannelsRepo } from "./repositories/distribution-channels.js";
import { domainsRepo } from "./repositories/domains.js";
import { enumsRepo } from "./repositories/enums.js";
import { featureFlagsRepo } from "./repositories/feature-flags.js";
import { finishesRepo } from "./repositories/finishes.js";
import { friendGroupMatchesRepo } from "./repositories/friend-group-matches.js";
import { friendGroupsRepo } from "./repositories/friend-groups.js";
import { healthRepo } from "./repositories/health.js";
import { ignoredCandidatesRepo } from "./repositories/ignored-candidates.js";
import { ingestRepo } from "./repositories/ingest.js";
import { jobRunsRepo } from "./repositories/job-runs.js";
import { keywordsRepo } from "./repositories/keywords.js";
import { languagesRepo } from "./repositories/languages.js";
import { listsRepo } from "./repositories/lists.js";
import { markersRepo } from "./repositories/markers.js";
import { marketplaceAdminRepo } from "./repositories/marketplace-admin.js";
import { marketplaceMappingRepo } from "./repositories/marketplace-mapping.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { organizationsRepo } from "./repositories/organizations.js";
import { podTournamentsRepo } from "./repositories/pod-tournaments.js";
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
import { tournamentsRepo } from "./repositories/tournaments.js";
import { userContactMethodsRepo } from "./repositories/user-contact-methods.js";
import { userFeatureFlagsRepo } from "./repositories/user-feature-flags.js";
import { userPreferencesRepo } from "./repositories/user-preferences.js";
import { userSharesRepo } from "./repositories/user-shares.js";
import { usersRepo } from "./repositories/users.js";
import {
  acceptTrade,
  applyTradeSync,
  cancelTrade,
  completeTrade,
  createTrade,
  declineTrade,
  setTradeQuantity,
  skipTradeSync,
} from "./services/card-trades.js";
import { assembleRuleCatalog, createCatalogPrintingsCache } from "./services/catalog-assembly.js";
import { deleteCollection } from "./services/collections.js";
import { addCopies, disposeCopies, moveCopies } from "./services/copies.js";
import { logEvents } from "./services/event-logger.js";
import { importErrata } from "./services/import-errata.js";
import { ensureInbox } from "./services/inbox.js";
import { ingestCandidates } from "./services/ingest-candidates.js";
import { ingestUserSubmission } from "./services/ingest-user-submission.js";
import { moveListEntries } from "./services/lists.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";
import type { TradeEmailDeps } from "./services/trade-notifications.js";

export interface Repos {
  collectionEvents: ReturnType<typeof collectionEventsRepo>;
  admins: ReturnType<typeof adminsRepo>;
  artVariants: ReturnType<typeof artVariantsRepo>;
  cardBans: ReturnType<typeof cardBansRepo>;
  cardTrades: ReturnType<typeof cardTradesRepo>;
  deckCheck: ReturnType<typeof deckCheckRepo>;
  cardTypes: ReturnType<typeof cardTypesRepo>;
  canonicalPrintings: ReturnType<typeof canonicalPrintingsRepo>;
  candidateMutations: ReturnType<typeof candidateMutationsRepo>;
  candidateCards: ReturnType<typeof candidateCardsRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  collectionDeckbuildingPrefs: ReturnType<typeof collectionDeckbuildingPrefsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  customTagCategories: ReturnType<typeof customTagCategoriesRepo>;
  customTags: ReturnType<typeof customTagsRepo>;
  deckFormats: ReturnType<typeof deckFormatsRepo>;
  deckPlans: ReturnType<typeof deckPlansRepo>;
  deckZones: ReturnType<typeof deckZonesRepo>;
  decks: ReturnType<typeof decksRepo>;
  domains: ReturnType<typeof domainsRepo>;
  enums: ReturnType<typeof enumsRepo>;
  featureFlags: ReturnType<typeof featureFlagsRepo>;
  finishes: ReturnType<typeof finishesRepo>;
  friendGroups: ReturnType<typeof friendGroupsRepo>;
  friendGroupMatches: ReturnType<typeof friendGroupMatchesRepo>;
  userContactMethods: ReturnType<typeof userContactMethodsRepo>;
  organizations: ReturnType<typeof organizationsRepo>;
  podTournaments: ReturnType<typeof podTournamentsRepo>;
  tournaments: ReturnType<typeof tournamentsRepo>;
  userFeatureFlags: ReturnType<typeof userFeatureFlagsRepo>;
  health: ReturnType<typeof healthRepo>;
  keywords: ReturnType<typeof keywordsRepo>;
  languages: ReturnType<typeof languagesRepo>;
  ignoredCandidates: ReturnType<typeof ignoredCandidatesRepo>;
  lists: ReturnType<typeof listsRepo>;
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
  userPreferences: ReturnType<typeof userPreferencesRepo>;
  userShares: ReturnType<typeof userSharesRepo>;
  users: ReturnType<typeof usersRepo>;
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
  moveListEntries: typeof moveListEntries;
  disposeCopies: typeof disposeCopies;
  getMappingOverview: typeof getMappingOverview;
  ingestCandidates: typeof ingestCandidates;
  ingestUserSubmission: typeof ingestUserSubmission;
  importErrata: typeof importErrata;
  createTrade: typeof createTrade;
  acceptTrade: typeof acceptTrade;
  declineTrade: typeof declineTrade;
  cancelTrade: typeof cancelTrade;
  completeTrade: typeof completeTrade;
  setTradeQuantity: typeof setTradeQuantity;
  applyTradeSync: typeof applyTradeSync;
  skipTradeSync: typeof skipTradeSync;
}

export function createRepos(db: Kysely<Database>): Repos {
  // ADR-034: one process-wide, content-addressed memo of the assembled catalog,
  // shared by every rule-expansion consumer below (`lists`, `friendGroupMatches`).
  // The app builds `repos` once (app.ts), so this memo lives for the process. It
  // is keyed on a cheap content-version probe, so repeated inline assemblies —
  // including the uncached anonymous public-share read — collapse onto a single
  // DB build that is reused until an admin edit rolls the version, then rebuilt
  // immediately. Reads stay both cheap and always fresh.
  const assembleCatalog = createCatalogPrintingsCache(
    () => assembleRuleCatalog(createRepos(db)),
    () => catalogRepo(db).catalogContentVersion(),
  );

  // Each repo is wrapped via instrumentRepo so every method opens an OTel
  // span named `repo.<name>.<method>`, parenting the Kysely `db.query`
  // spans for clean repo-method attribution in traces.
  const raw = {
    collectionEvents: collectionEventsRepo(db),
    admins: adminsRepo(db),
    artVariants: artVariantsRepo(db),
    cardBans: cardBansRepo(db),
    cardTrades: cardTradesRepo(db),
    deckCheck: deckCheckRepo(db),
    cardTypes: cardTypesRepo(db),
    canonicalPrintings: canonicalPrintingsRepo(db),
    candidateMutations: candidateMutationsRepo(db),
    candidateCards: candidateCardsRepo(db),
    catalog: catalogRepo(db),
    collections: collectionsRepo(db),
    collectionDeckbuildingPrefs: collectionDeckbuildingPrefsRepo(db),
    copies: copiesRepo(db),
    customTagCategories: customTagCategoriesRepo(db),
    customTags: customTagsRepo(db),
    deckFormats: deckFormatsRepo(db),
    deckPlans: deckPlansRepo(db),
    deckZones: deckZonesRepo(db),
    decks: decksRepo(db),
    domains: domainsRepo(db),
    enums: enumsRepo(db),
    featureFlags: featureFlagsRepo(db),
    finishes: finishesRepo(db),
    friendGroups: friendGroupsRepo(db),
    // ADR-034: dynamic lists participate in matching — same providers as `lists`.
    friendGroupMatches: friendGroupMatchesRepo(db, {
      assembleCatalog,
      ownedCopies: (ownerId) => copiesRepo(db).ownedRowsForUser(ownerId),
      enumOrders: () => enumsRepo(db).keepPriorityOrders(),
    }),
    userContactMethods: userContactMethodsRepo(db),
    organizations: organizationsRepo(db),
    podTournaments: podTournamentsRepo(db),
    tournaments: tournamentsRepo(db),
    userFeatureFlags: userFeatureFlagsRepo(db),
    health: healthRepo(db),
    keywords: keywordsRepo(db),
    languages: languagesRepo(db),
    ignoredCandidates: ignoredCandidatesRepo(db),
    // ADR-034: dynamic list rules need the full catalog + the owner's copies to
    // evaluate. Both providers are lazy — only paid when a list carries a rule.
    // `assembleCatalog` is the shared TTL memo above; `ownedCopies` stays per
    // call (owner-specific, not cacheable across users).
    lists: listsRepo(db, {
      assembleCatalog,
      ownedCopies: (ownerId) => copiesRepo(db).ownedRowsForUser(ownerId),
      enumOrders: () => enumsRepo(db).keepPriorityOrders(),
    }),
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
    userPreferences: userPreferencesRepo(db),
    userShares: userSharesRepo(db),
    users: usersRepo(db),
    ingest: ingestRepo(db),
    marketplaceMapping: marketplaceMappingRepo(db),
    priceRefresh: priceRefreshRepo(db),
    printingEvents: printingEventsRepo(db),
    jobRuns: jobRunsRepo(db),
  };
  return Object.fromEntries(
    Object.entries(raw).map(([name, repo]) => [
      name,
      instrumentRepo(name, repo as Record<string, unknown>),
    ]),
  ) as unknown as Repos;
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
  moveListEntries,
  disposeCopies,
  getMappingOverview,
  ingestCandidates,
  ingestUserSubmission,
  importErrata,
  createTrade,
  acceptTrade,
  declineTrade,
  cancelTrade,
  completeTrade,
  setTradeQuantity,
  applyTradeSync,
  skipTradeSync,
};

/**
 * Builds the services object, binding the ADR-030 trade-request email deps into
 * `createTrade` so the route handler keeps its plain `(repos, input)` call. When
 * `emailDeps` is absent (e.g. SMTP unconfigured, or in tests that don't assert
 * mail) `createTrade` simply skips the best-effort email.
 * @returns A {@link Services} object wired with the given email deps.
 */
export function createServices(emailDeps?: TradeEmailDeps): Services {
  if (emailDeps === undefined) {
    return services;
  }
  return {
    ...services,
    createTrade: (repos, input) => createTrade(repos, input, emailDeps),
  };
}
