import { priceLookupFromMap } from "@openrift/shared";
import type { Marketplace, PriceMap } from "@openrift/shared";
import type { Kysely } from "kysely";

import type { Database } from "./db/index.js";
import { instrumentRepo } from "./db/instrumented-repo.js";
import { adminEventsRepo } from "./repositories/admin-events.js";
import { adminGrantsRepo } from "./repositories/admin-grants.js";
import { adminsRepo } from "./repositories/admins.js";
import { artVariantsRepo } from "./repositories/art-variants.js";
import { candidateCardsRepo } from "./repositories/candidate-cards.js";
import { canonicalPrintingsRepo } from "./repositories/canonical-printings.js";
import { cardBansRepo } from "./repositories/card-bans.js";
import { cardErrataRepo } from "./repositories/card-errata.js";
import { cardSubmissionsRepo } from "./repositories/card-submissions.js";
import { cardTokensRepo } from "./repositories/card-tokens.js";
import { cardTradesRepo } from "./repositories/card-trades.js";
import { cardTypesRepo } from "./repositories/card-types.js";
import { catalogDeleteGuardsRepo } from "./repositories/catalog-delete-guards.js";
import { catalogMutationsRepo } from "./repositories/catalog-mutations.js";
import { catalogRepo } from "./repositories/catalog.js";
import { collectionDeckbuildingPrefsRepo } from "./repositories/collection-deckbuilding-prefs.js";
import { collectionEventsRepo } from "./repositories/collection-events.js";
import { collectionSidebarPrefsRepo } from "./repositories/collection-sidebar-prefs.js";
import { collectionsRepo } from "./repositories/collections.js";
import { copiesRepo } from "./repositories/copies.js";
import { customTagCategoriesRepo } from "./repositories/custom-tag-categories.js";
import { customTagsRepo } from "./repositories/custom-tags.js";
import { deckCheckKeysRepo } from "./repositories/deck-check-keys.js";
import { deckCheckRepo } from "./repositories/deck-check.js";
import { deckFoldersRepo } from "./repositories/deck-folders.js";
import { deckFormatsRepo } from "./repositories/deck-formats.js";
import { deckPlansRepo } from "./repositories/deck-plans.js";
import { deckZonesRepo } from "./repositories/deck-zones.js";
import { decksRepo } from "./repositories/decks.js";
import { distributionChannelsRepo } from "./repositories/distribution-channels.js";
import { domainsRepo } from "./repositories/domains.js";
import { enumsRepo } from "./repositories/enums.js";
import { featureFlagsRepo } from "./repositories/feature-flags.js";
import { finishesRepo } from "./repositories/finishes.js";
import { friendGroupDiscordLinksRepo } from "./repositories/friend-group-discord-links.js";
import { friendGroupMatchesRepo } from "./repositories/friend-group-matches.js";
import { friendGroupsRepo } from "./repositories/friend-groups.js";
import { healthRepo } from "./repositories/health.js";
import { ignoredCandidatesRepo } from "./repositories/ignored-candidates.js";
import { ingestRepo } from "./repositories/ingest.js";
import { jobRunsRepo } from "./repositories/job-runs.js";
import { jobSchedulesRepo } from "./repositories/job-schedules.js";
import { keywordsRepo } from "./repositories/keywords.js";
import { languagesRepo } from "./repositories/languages.js";
import { listsRepo } from "./repositories/lists.js";
import { loansRepo } from "./repositories/loans.js";
import { markersRepo } from "./repositories/markers.js";
import { marketplaceAdminRepo } from "./repositories/marketplace-admin.js";
import { marketplaceMappingRepo } from "./repositories/marketplace-mapping.js";
import { marketplaceRepo } from "./repositories/marketplace.js";
import { metaOverlaysRepo } from "./repositories/meta-overlays.js";
import { metaSubmissionsRepo } from "./repositories/meta-submissions.js";
import { metaRepo } from "./repositories/meta.js";
import { organizationsRepo } from "./repositories/organizations.js";
import { overlayChannelsRepo } from "./repositories/overlay-channels.js";
import { playloltcgEventsRepo } from "./repositories/playloltcg-events.js";
import { playloltcgResultsRepo } from "./repositories/playloltcg-results.js";
import { podTournamentsRepo } from "./repositories/pod-tournaments.js";
import { priceRefreshRepo } from "./repositories/price-refresh.js";
import { printingCitationsRepo } from "./repositories/printing-citations.js";
import { printingEventsRepo } from "./repositories/printing-events.js";
import { printingImagesRepo } from "./repositories/printing-images.js";
import { productsRepo } from "./repositories/products.js";
import { providerSettingsRepo } from "./repositories/provider-settings.js";
import { raritiesRepo } from "./repositories/rarities.js";
import { rulesRepo } from "./repositories/rules.js";
import { scanIndexRepo } from "./repositories/scan-index.js";
import { setsRepo } from "./repositories/sets.js";
import { siteSettingsRepo } from "./repositories/site-settings.js";
import { stagePresetsRepo } from "./repositories/stage-presets.js";
import { statusRepo } from "./repositories/status.js";
import { superTypesRepo } from "./repositories/super-types.js";
import { tagCategoriesRepo } from "./repositories/tag-categories.js";
import { tagDefinitionsRepo } from "./repositories/tag-definitions.js";
import { tierListsRepo } from "./repositories/tier-lists.js";
import { tournamentsRepo } from "./repositories/tournaments.js";
import { userContactMethodsRepo } from "./repositories/user-contact-methods.js";
import { userFeatureFlagsRepo } from "./repositories/user-feature-flags.js";
import { userPreferencesRepo } from "./repositories/user-preferences.js";
import { userSharesRepo } from "./repositories/user-shares.js";
import { usersRepo } from "./repositories/users.js";
import { uvsgamesEventsRepo } from "./repositories/uvsgames-events.js";
import { uvsgamesResultsRepo } from "./repositories/uvsgames-results.js";
import { notifyAdminsOfCardSubmission } from "./services/card-submission-notifications.js";
import {
  acceptTrade,
  applyTradeSync,
  cancelTrade,
  createTrade,
  declineTrade,
  listTradeCopyOptions,
  setTradeQuantity,
  skipTradeSync,
} from "./services/card-trades.js";
import { assembleRuleCatalog, createContentAddressedCache } from "./services/catalog-assembly.js";
import { clearCollection, deleteCollection, resetCollections } from "./services/collections.js";
import { addCopies, disposeCopies, moveCopies, updateCopies } from "./services/copies.js";
import { logEvents } from "./services/event-logger.js";
import {
  notifyAdminsOfGroupJoinRequest,
  notifyMemberOfGroupApproval,
} from "./services/group-join-notifications.js";
import { importErrata } from "./services/import-errata.js";
import { ensureInbox } from "./services/inbox.js";
import { ingestCandidates } from "./services/ingest-candidates.js";
import { ingestMetaOverlays } from "./services/ingest-meta-overlays.js";
import { ingestUserSubmission } from "./services/ingest-user-submission.js";
import { moveListEntries } from "./services/lists.js";
import {
  acknowledgeLoan,
  createLoan,
  deleteLoan,
  rejectLoan,
  returnLoanCopies,
  writeOffLoan,
} from "./services/loans.js";
import { getMappingOverview } from "./services/marketplace-mapping.js";
import {
  suggestMetaEventMatches,
  suggestMetaPlayerMatches,
} from "./services/meta-match-suggestions.js";
import {
  acceptMetaEventOverlay,
  acceptMetaPlayerOverlay,
  acceptMetaPlayerOverlays,
  rejectMetaOverlay,
} from "./services/meta-overlay-review.js";
import { promoteMetaEvent, promoteNewEvent } from "./services/meta-promote.js";
import { repromoteMetaEvents } from "./services/meta-repromote.js";
import { submitMetaDeck, submitMetaEventCorrection } from "./services/meta-submission.js";
import type { TradeEmailDeps } from "./services/trade-notifications.js";

export interface Repos {
  collectionEvents: ReturnType<typeof collectionEventsRepo>;
  admins: ReturnType<typeof adminsRepo>;
  adminEvents: ReturnType<typeof adminEventsRepo>;
  adminGrants: ReturnType<typeof adminGrantsRepo>;
  artVariants: ReturnType<typeof artVariantsRepo>;
  cardBans: ReturnType<typeof cardBansRepo>;
  cardErrata: ReturnType<typeof cardErrataRepo>;
  cardSubmissions: ReturnType<typeof cardSubmissionsRepo>;
  cardTokens: ReturnType<typeof cardTokensRepo>;
  cardTrades: ReturnType<typeof cardTradesRepo>;
  deckCheck: ReturnType<typeof deckCheckRepo>;
  deckCheckKeys: ReturnType<typeof deckCheckKeysRepo>;
  cardTypes: ReturnType<typeof cardTypesRepo>;
  canonicalPrintings: ReturnType<typeof canonicalPrintingsRepo>;
  candidateCards: ReturnType<typeof candidateCardsRepo>;
  catalog: ReturnType<typeof catalogRepo>;
  catalogDeleteGuards: ReturnType<typeof catalogDeleteGuardsRepo>;
  catalogMutations: ReturnType<typeof catalogMutationsRepo>;
  collections: ReturnType<typeof collectionsRepo>;
  collectionDeckbuildingPrefs: ReturnType<typeof collectionDeckbuildingPrefsRepo>;
  collectionSidebarPrefs: ReturnType<typeof collectionSidebarPrefsRepo>;
  copies: ReturnType<typeof copiesRepo>;
  customTagCategories: ReturnType<typeof customTagCategoriesRepo>;
  customTags: ReturnType<typeof customTagsRepo>;
  deckFolders: ReturnType<typeof deckFoldersRepo>;
  deckFormats: ReturnType<typeof deckFormatsRepo>;
  deckPlans: ReturnType<typeof deckPlansRepo>;
  deckZones: ReturnType<typeof deckZonesRepo>;
  decks: ReturnType<typeof decksRepo>;
  domains: ReturnType<typeof domainsRepo>;
  enums: ReturnType<typeof enumsRepo>;
  featureFlags: ReturnType<typeof featureFlagsRepo>;
  finishes: ReturnType<typeof finishesRepo>;
  friendGroups: ReturnType<typeof friendGroupsRepo>;
  friendGroupDiscordLinks: ReturnType<typeof friendGroupDiscordLinksRepo>;
  friendGroupMatches: ReturnType<typeof friendGroupMatchesRepo>;
  userContactMethods: ReturnType<typeof userContactMethodsRepo>;
  organizations: ReturnType<typeof organizationsRepo>;
  overlayChannels: ReturnType<typeof overlayChannelsRepo>;
  podTournaments: ReturnType<typeof podTournamentsRepo>;
  stagePresets: ReturnType<typeof stagePresetsRepo>;
  tierLists: ReturnType<typeof tierListsRepo>;
  tournaments: ReturnType<typeof tournamentsRepo>;
  userFeatureFlags: ReturnType<typeof userFeatureFlagsRepo>;
  health: ReturnType<typeof healthRepo>;
  keywords: ReturnType<typeof keywordsRepo>;
  languages: ReturnType<typeof languagesRepo>;
  ignoredCandidates: ReturnType<typeof ignoredCandidatesRepo>;
  lists: ReturnType<typeof listsRepo>;
  loans: ReturnType<typeof loansRepo>;
  marketplace: ReturnType<typeof marketplaceRepo>;
  marketplaceAdmin: ReturnType<typeof marketplaceAdminRepo>;
  meta: ReturnType<typeof metaRepo>;
  metaOverlays: ReturnType<typeof metaOverlaysRepo>;
  uvsgamesEvents: ReturnType<typeof uvsgamesEventsRepo>;
  uvsgamesResults: ReturnType<typeof uvsgamesResultsRepo>;
  playloltcgEvents: ReturnType<typeof playloltcgEventsRepo>;
  playloltcgResults: ReturnType<typeof playloltcgResultsRepo>;
  metaSubmissions: ReturnType<typeof metaSubmissionsRepo>;
  printingImages: ReturnType<typeof printingImagesRepo>;
  printingCitations: ReturnType<typeof printingCitationsRepo>;
  products: ReturnType<typeof productsRepo>;
  markers: ReturnType<typeof markersRepo>;
  distributionChannels: ReturnType<typeof distributionChannelsRepo>;
  rarities: ReturnType<typeof raritiesRepo>;
  rules: ReturnType<typeof rulesRepo>;
  sets: ReturnType<typeof setsRepo>;
  status: ReturnType<typeof statusRepo>;
  superTypes: ReturnType<typeof superTypesRepo>;
  tagCategories: ReturnType<typeof tagCategoriesRepo>;
  tagDefinitions: ReturnType<typeof tagDefinitionsRepo>;
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
  jobSchedules: ReturnType<typeof jobSchedulesRepo>;
  scanIndex: ReturnType<typeof scanIndexRepo>;
}

export interface Services {
  ensureInbox: typeof ensureInbox;
  logEvents: typeof logEvents;
  clearCollection: typeof clearCollection;
  deleteCollection: typeof deleteCollection;
  resetCollections: typeof resetCollections;
  addCopies: typeof addCopies;
  moveCopies: typeof moveCopies;
  updateCopies: typeof updateCopies;
  moveListEntries: typeof moveListEntries;
  disposeCopies: typeof disposeCopies;
  getMappingOverview: typeof getMappingOverview;
  ingestCandidates: typeof ingestCandidates;
  ingestMetaOverlays: typeof ingestMetaOverlays;
  ingestUserSubmission: typeof ingestUserSubmission;
  promoteMetaEvent: typeof promoteMetaEvent;
  promoteNewEvent: typeof promoteNewEvent;
  repromoteMetaEvents: typeof repromoteMetaEvents;
  acceptMetaEventOverlay: typeof acceptMetaEventOverlay;
  acceptMetaPlayerOverlay: typeof acceptMetaPlayerOverlay;
  acceptMetaPlayerOverlays: typeof acceptMetaPlayerOverlays;
  rejectMetaOverlay: typeof rejectMetaOverlay;
  suggestMetaEventMatches: typeof suggestMetaEventMatches;
  suggestMetaPlayerMatches: typeof suggestMetaPlayerMatches;
  submitMetaDeck: typeof submitMetaDeck;
  submitMetaEventCorrection: typeof submitMetaEventCorrection;
  notifyAdminsOfCardSubmission: typeof notifyAdminsOfCardSubmission;
  notifyAdminsOfGroupJoinRequest: typeof notifyAdminsOfGroupJoinRequest;
  notifyMemberOfGroupApproval: typeof notifyMemberOfGroupApproval;
  importErrata: typeof importErrata;
  createTrade: typeof createTrade;
  listTradeCopyOptions: typeof listTradeCopyOptions;
  acceptTrade: typeof acceptTrade;
  declineTrade: typeof declineTrade;
  cancelTrade: typeof cancelTrade;
  setTradeQuantity: typeof setTradeQuantity;
  applyTradeSync: typeof applyTradeSync;
  skipTradeSync: typeof skipTradeSync;
  createLoan: typeof createLoan;
  returnLoanCopies: typeof returnLoanCopies;
  writeOffLoan: typeof writeOffLoan;
  acknowledgeLoan: typeof acknowledgeLoan;
  rejectLoan: typeof rejectLoan;
  deleteLoan: typeof deleteLoan;
}

export function createRepos(db: Kysely<Database>): Repos {
  // ADR-034: one process-wide, content-addressed memo of the assembled catalog,
  // shared by every rule-expansion consumer below (`lists`, `friendGroupMatches`).
  // The app builds `repos` once (app.ts), so this memo lives for the process. It
  // is keyed on a cheap content-version probe, so repeated inline assemblies —
  // including the uncached anonymous public-share read — collapse onto a single
  // DB build that is reused until an admin edit rolls the version, then rebuilt
  // immediately. Reads stay both cheap and always fresh.
  const assembleCatalog = createContentAddressedCache(
    () => assembleRuleCatalog(createRepos(db)),
    () => catalogRepo(db).catalogContentVersion(),
  );

  // The thirteen reference tables hold ~71 rows between them and change only on
  // an admin edit, but `all()` spent thirteen round trips re-reading them on
  // every /init and deck read. Memoized on the same content-addressed helper, so
  // an edit still shows up on the next read. One shared instance — a fresh
  // `enumsRepo(db)` per call site would each get their own empty memo.
  const enums = enumsRepo(db);
  const loadEnums = createContentAddressedCache(
    () => enums.all(),
    () => enums.contentVersion(),
  );
  const cachedEnums = {
    ...enums,
    all: loadEnums,
    // Derived from the same memo rather than three more slug-only reads: `all()`
    // already orders each of these by sortOrder, which is what this returns.
    keepPriorityOrders: async () => {
      const rows = await loadEnums();
      return {
        finishes: rows.finishes.map((row) => row.slug),
        rarities: rows.rarities.map((row) => row.slug),
        artVariants: rows.artVariants.map((row) => row.slug),
      };
    },
  };

  // Latest prices for dynamic list rules that bound on price (ADR-034), on the
  // same content-addressed memo pattern as the catalog: rule expansion runs
  // inline on every read of such a list (including the uncached anonymous
  // public-share path), and this keeps those reads from re-loading the full
  // price map. The token rolls when `refreshLatestPrices` publishes new data
  // (see `latestPricesContentVersion`), so filters follow the price crons with
  // no staleness window.
  const rulePriceLookup = createContentAddressedCache(
    async () => {
      const rows = await marketplaceRepo(db).latestPrices();
      const map: PriceMap = {};
      for (const row of rows) {
        (map[row.printingId] ??= {})[row.marketplace as Marketplace] = row.marketCents;
      }
      return priceLookupFromMap(map);
    },
    () => marketplaceRepo(db).latestPricesContentVersion(),
  );

  // Each repo is wrapped via instrumentRepo so every method opens an OTel
  // span named `repo.<name>.<method>`, parenting the Kysely `db.query`
  // spans for clean repo-method attribution in traces.
  const raw = {
    collectionEvents: collectionEventsRepo(db),
    admins: adminsRepo(db),
    adminEvents: adminEventsRepo(db),
    adminGrants: adminGrantsRepo(db),
    artVariants: artVariantsRepo(db),
    cardBans: cardBansRepo(db),
    cardErrata: cardErrataRepo(db),
    cardSubmissions: cardSubmissionsRepo(db),
    cardTokens: cardTokensRepo(db),
    cardTrades: cardTradesRepo(db),
    deckCheck: deckCheckRepo(db),
    deckCheckKeys: deckCheckKeysRepo(db),
    cardTypes: cardTypesRepo(db),
    canonicalPrintings: canonicalPrintingsRepo(db),
    candidateCards: candidateCardsRepo(db),
    catalog: catalogRepo(db),
    catalogDeleteGuards: catalogDeleteGuardsRepo(db),
    catalogMutations: catalogMutationsRepo(db),
    collections: collectionsRepo(db),
    collectionDeckbuildingPrefs: collectionDeckbuildingPrefsRepo(db),
    collectionSidebarPrefs: collectionSidebarPrefsRepo(db),
    copies: copiesRepo(db),
    customTagCategories: customTagCategoriesRepo(db),
    customTags: customTagsRepo(db),
    deckFolders: deckFoldersRepo(db),
    deckFormats: deckFormatsRepo(db),
    deckPlans: deckPlansRepo(db),
    deckZones: deckZonesRepo(db),
    decks: decksRepo(db),
    domains: domainsRepo(db),
    enums: cachedEnums,
    featureFlags: featureFlagsRepo(db),
    finishes: finishesRepo(db),
    friendGroups: friendGroupsRepo(db),
    friendGroupDiscordLinks: friendGroupDiscordLinksRepo(db),
    // ADR-034: dynamic lists participate in matching — same providers as `lists`.
    friendGroupMatches: friendGroupMatchesRepo(db, {
      assembleCatalog,
      ownedCopies: (ownerId, printingIds) => copiesRepo(db).ownedRowsForUser(ownerId, printingIds),
      enumOrders: () => cachedEnums.keepPriorityOrders(),
      priceLookup: rulePriceLookup,
    }),
    userContactMethods: userContactMethodsRepo(db),
    organizations: organizationsRepo(db),
    overlayChannels: overlayChannelsRepo(db),
    podTournaments: podTournamentsRepo(db),
    stagePresets: stagePresetsRepo(db),
    tierLists: tierListsRepo(db),
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
      ownedCopies: (ownerId, printingIds) => copiesRepo(db).ownedRowsForUser(ownerId, printingIds),
      enumOrders: () => cachedEnums.keepPriorityOrders(),
      priceLookup: rulePriceLookup,
    }),
    loans: loansRepo(db),
    marketplace: marketplaceRepo(db),
    marketplaceAdmin: marketplaceAdminRepo(db),
    meta: metaRepo(db),
    metaOverlays: metaOverlaysRepo(db),
    uvsgamesEvents: uvsgamesEventsRepo(db),
    uvsgamesResults: uvsgamesResultsRepo(db),
    playloltcgEvents: playloltcgEventsRepo(db),
    playloltcgResults: playloltcgResultsRepo(db),
    metaSubmissions: metaSubmissionsRepo(db),
    printingImages: printingImagesRepo(db),
    printingCitations: printingCitationsRepo(db),
    products: productsRepo(db),
    markers: markersRepo(db),
    distributionChannels: distributionChannelsRepo(db),
    rarities: raritiesRepo(db),
    rules: rulesRepo(db),
    sets: setsRepo(db),
    status: statusRepo(db),
    superTypes: superTypesRepo(db),
    tagCategories: tagCategoriesRepo(db),
    tagDefinitions: tagDefinitionsRepo(db),
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
    jobSchedules: jobSchedulesRepo(db),
    scanIndex: scanIndexRepo(db),
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
  clearCollection,
  deleteCollection,
  resetCollections,
  addCopies,
  moveCopies,
  updateCopies,
  moveListEntries,
  disposeCopies,
  getMappingOverview,
  ingestCandidates,
  ingestMetaOverlays,
  ingestUserSubmission,
  promoteMetaEvent,
  promoteNewEvent,
  repromoteMetaEvents,
  acceptMetaEventOverlay,
  acceptMetaPlayerOverlay,
  acceptMetaPlayerOverlays,
  rejectMetaOverlay,
  suggestMetaEventMatches,
  suggestMetaPlayerMatches,
  submitMetaDeck,
  submitMetaEventCorrection,
  notifyAdminsOfCardSubmission,
  notifyAdminsOfGroupJoinRequest,
  notifyMemberOfGroupApproval,
  importErrata,
  createTrade,
  listTradeCopyOptions,
  acceptTrade,
  declineTrade,
  cancelTrade,
  setTradeQuantity,
  applyTradeSync,
  skipTradeSync,
  createLoan,
  returnLoanCopies,
  writeOffLoan,
  acknowledgeLoan,
  rejectLoan,
  deleteLoan,
};

/**
 * Builds the services object, binding the transactional-email deps into the
 * services that send from the request path — `createTrade` (ADR-030),
 * `notifyAdminsOfCardSubmission` (ADR-036) and the two group notifications —
 * so route handlers keep their plain `(repos, input)` calls. When `emailDeps`
 * is absent (e.g. SMTP unconfigured, or in tests that don't assert mail) they
 * simply skip their best-effort email.
 * @returns A {@link Services} object wired with the given email deps.
 */
export function createServices(emailDeps?: TradeEmailDeps): Services {
  if (emailDeps === undefined) {
    return services;
  }
  return {
    ...services,
    createTrade: (repos, input) => createTrade(repos, input, emailDeps),
    notifyAdminsOfCardSubmission: (repos, submission) =>
      notifyAdminsOfCardSubmission(repos, submission, emailDeps),
    notifyAdminsOfGroupJoinRequest: (repos, request) =>
      notifyAdminsOfGroupJoinRequest(repos, request, emailDeps),
    notifyMemberOfGroupApproval: (repos, approval) =>
      notifyMemberOfGroupApproval(repos, approval, emailDeps),
  };
}
