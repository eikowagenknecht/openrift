// AUTO-ASSEMBLED router: every domain oRPC router merged into one, served by a
// single OpenAPIHandler + single catch-all mount (see app.ts). Auth is enforced
// per-procedure by the requireUser middleware each router carries (fail-closed);
// the reporting error interceptor captures 5xx faults to Sentry and maps thrown
// AppError -> ORPCError at this one boundary.
import type { Logger } from "@openrift/shared/logger";
import { OpenAPIHandler } from "@orpc/openapi/fetch";

import { adminCardSubmissionsRouter } from "../modules/candidates/routes/admin-card-submissions.js";
import { adminIgnoredCandidatesRouter } from "../modules/candidates/routes/admin-ignored-candidates.js";
import { adminStagingCardOverridesRouter } from "../modules/candidates/routes/admin-staging-card-overrides.js";
import { cardSubmissionsRouter } from "../modules/candidates/routes/authenticated-card-submissions.js";
import { adminArtVariantsRouter } from "../modules/catalog/routes/admin-art-variants.js";
import { adminCardTagsRouter } from "../modules/catalog/routes/admin-card-tags.js";
import { adminCardTypesRouter } from "../modules/catalog/routes/admin-card-types.js";
import { adminCardBansRouter } from "../modules/catalog/routes/admin-cards-bans.js";
import { adminCardImagesRouter } from "../modules/catalog/routes/admin-cards-images.js";
import { adminCardMutationsRouter } from "../modules/catalog/routes/admin-cards-mutations.js";
import { adminCardQueriesRouter } from "../modules/catalog/routes/admin-cards-queries.js";
import { adminCatalogRouter } from "../modules/catalog/routes/admin-catalog.js";
import { adminDistributionChannelsRouter } from "../modules/catalog/routes/admin-distribution-channels.js";
import { adminDomainsRouter } from "../modules/catalog/routes/admin-domains.js";
import { adminFinishesRouter } from "../modules/catalog/routes/admin-finishes.js";
import { adminImagesRouter } from "../modules/catalog/routes/admin-images.js";
import { adminKeywordsRouter } from "../modules/catalog/routes/admin-keywords.js";
import { adminLanguagesRouter } from "../modules/catalog/routes/admin-languages.js";
import { adminMarkersRouter } from "../modules/catalog/routes/admin-markers.js";
import { adminPrintingCitationsRouter } from "../modules/catalog/routes/admin-printing-citations.js";
import { adminPrintingDeskRouter } from "../modules/catalog/routes/admin-printing-desk.js";
import { adminPrintingEventsRouter } from "../modules/catalog/routes/admin-printing-events.js";
import { adminRaritiesRouter } from "../modules/catalog/routes/admin-rarities.js";
import { adminRulesRouter } from "../modules/catalog/routes/admin-rules.js";
import { adminSuperTypesRouter } from "../modules/catalog/routes/admin-super-types.js";
import { adminTypographyReviewRouter } from "../modules/catalog/routes/admin-typography-review.js";
import { cardsRouter } from "../modules/catalog/routes/public-cards.js";
import { catalogRouter } from "../modules/catalog/routes/public-catalog.js";
import { promosRouter } from "../modules/catalog/routes/public-promos.js";
import { rulesRouter } from "../modules/catalog/routes/public-rules.js";
import { setsRouter } from "../modules/catalog/routes/public-sets.js";
import { discordBotRouter } from "../modules/chat/routes/public-discord-bot.js";
import { adminCustomTagsRouter } from "../modules/collections/routes/admin-custom-tags.js";
import { collectionEventsRouter } from "../modules/collections/routes/authenticated-collection-events.js";
import { collectionValueHistoryRouter } from "../modules/collections/routes/authenticated-collection-value-history.js";
import { collectionsRouter } from "../modules/collections/routes/authenticated-collections.js";
import { copiesRouter } from "../modules/collections/routes/authenticated-copies.js";
import { publicCollectionsRouter } from "../modules/collections/routes/public-collections.js";
import { adminDeckFormatsRouter } from "../modules/decks/routes/admin-deck-formats.js";
import { adminDeckZonesRouter } from "../modules/decks/routes/admin-deck-zones.js";
import { adminFormatsRouter } from "../modules/decks/routes/admin-formats.js";
import { deckFoldersRouter } from "../modules/decks/routes/authenticated-deck-folders.js";
import { decksRouter } from "../modules/decks/routes/authenticated-decks.js";
import { publicDecksRouter } from "../modules/decks/routes/public-decks.js";
import { cardTradesRouter } from "../modules/groups/routes/authenticated-card-trades.js";
import { friendGroupsRouter } from "../modules/groups/routes/authenticated-friend-groups.js";
import { loansRouter } from "../modules/groups/routes/authenticated-loans.js";
import { userShareRouter } from "../modules/groups/routes/authenticated-user-share.js";
import { publicFriendGroupsRouter } from "../modules/groups/routes/public-friend-groups.js";
import { publicUserShareRouter } from "../modules/groups/routes/public-user-share.js";
import { listsRouter } from "../modules/lists/routes/authenticated-lists.js";
import { publicListsRouter } from "../modules/lists/routes/public-lists.js";
import { adminIgnoredProductsRouter } from "../modules/marketplace/routes/admin-ignored-products.js";
import { adminMarketplaceGroupsRouter } from "../modules/marketplace/routes/admin-marketplace-groups.js";
import { adminProductsRouter } from "../modules/marketplace/routes/admin-products.js";
import { adminProviderSettingsRouter } from "../modules/marketplace/routes/admin-provider-settings.js";
import { adminUnifiedMappingsRouter } from "../modules/marketplace/routes/admin-unified-mappings.js";
import { cardmarketStockRouter } from "../modules/marketplace/routes/authenticated-cardmarket-stock.js";
import { pricesRouter } from "../modules/marketplace/routes/public-prices.js";
import { productsRouter } from "../modules/marketplace/routes/public-products.js";
import { adminMetaCandidatesRouter } from "../modules/meta/routes/admin-meta-candidates.js";
import { adminMetaCatalogRouter } from "../modules/meta/routes/admin-meta-catalog.js";
import { adminMetaSubmissionsRouter } from "../modules/meta/routes/admin-meta-submissions.js";
import { adminMetaRouter } from "../modules/meta/routes/admin-meta.js";
import { metaSubmissionsRouter } from "../modules/meta/routes/authenticated-meta-submissions.js";
import { metaRouter } from "../modules/meta/routes/public-meta.js";
import { adminScanRouter } from "../modules/scan/routes/admin-scan.js";
import { scanReportsRouter } from "../modules/scan/routes/authenticated-scan-reports.js";
import { scanRouter } from "../modules/scan/routes/public-scan.js";
import { overlayRouter } from "../modules/stage/routes/authenticated-overlay.js";
import { stagePresetsRouter } from "../modules/stage/routes/authenticated-stage-presets.js";
import { tierListsRouter } from "../modules/stage/routes/authenticated-tier-lists.js";
import { publicOverlayRouter } from "../modules/stage/routes/public-overlay.js";
import { publicTierListsRouter } from "../modules/stage/routes/public-tier-lists.js";
import { adminAuditEventsRouter } from "../modules/system/routes/admin-audit-events.js";
import { adminCacheRouter } from "../modules/system/routes/admin-cache.js";
import { adminChangelogRouter } from "../modules/system/routes/admin-changelog.js";
import { adminCoreRouter } from "../modules/system/routes/admin-core.js";
import { adminDashboardRouter } from "../modules/system/routes/admin-dashboard.js";
import { adminJobRunsRouter } from "../modules/system/routes/admin-job-runs.js";
import { adminJobSchedulesRouter } from "../modules/system/routes/admin-job-schedules.js";
import { adminOperationsRouter } from "../modules/system/routes/admin-operations.js";
import { adminSiteSettingsRouter } from "../modules/system/routes/admin-site-settings.js";
import { adminStatusRouter } from "../modules/system/routes/admin-status.js";
import { initRouter } from "../modules/system/routes/public-init.js";
import { landingSummaryRouter } from "../modules/system/routes/public-landing-summary.js";
import { siteSettingsRouter } from "../modules/system/routes/public-site-settings.js";
import { sitemapRouter } from "../modules/system/routes/public-sitemap.js";
import { adminOrganizationsRouter } from "../modules/tournaments/routes/admin-organizations.js";
import { deckCheckKeysRouter } from "../modules/tournaments/routes/authenticated-deck-check-keys.js";
import { deckCheckPlayerRouter } from "../modules/tournaments/routes/authenticated-deck-check-player.js";
import { organizationsRouter } from "../modules/tournaments/routes/authenticated-organizations.js";
import { tournamentDeckCheckRouter } from "../modules/tournaments/routes/authenticated-tournament-deck-check.js";
import { tournamentsRouter } from "../modules/tournaments/routes/authenticated-tournaments.js";
import { deckCheckClaimRouter } from "../modules/tournaments/routes/public-deck-check-claim.js";
import { deckCheckIngestRouter } from "../modules/tournaments/routes/public-deck-check-ingest.js";
import { publicPodTournamentsRouter } from "../modules/tournaments/routes/public-pod-tournaments.js";
import { publicTournamentsRouter } from "../modules/tournaments/routes/public-tournaments.js";
import { adminFeatureFlagsRouter } from "../modules/users/routes/admin-feature-flags.js";
import { adminGrantsRouter } from "../modules/users/routes/admin-grants.js";
import { adminUsersRouter } from "../modules/users/routes/admin-users.js";
import { contactMethodsRouter } from "../modules/users/routes/authenticated-contact-methods.js";
import { preferencesRouter } from "../modules/users/routes/authenticated-preferences.js";
import { featureFlagsRouter } from "../modules/users/routes/public-feature-flags.js";
import { unsubscribeRouter } from "../modules/users/routes/public-unsubscribe.js";
import { cacheControlInterceptor } from "./cache-control-interceptor.js";
import { makeReportingErrorInterceptor } from "./error-reporting-interceptor.js";

/** Keyed arbitrarily; OpenAPI paths come from each procedure's contract `.route({ path })`. */
const apiRouter = {
  adminArtVariantsRouter,
  adminAuditEventsRouter,
  adminCacheRouter,
  adminCardTypesRouter,
  adminCardBansRouter,
  adminCardImagesRouter,
  adminCardMutationsRouter,
  adminCardQueriesRouter,
  adminCardSubmissionsRouter,
  adminCardTagsRouter,
  adminCatalogRouter,
  adminChangelogRouter,
  adminCoreRouter,
  adminCustomTagsRouter,
  adminDashboardRouter,
  adminDeckFormatsRouter,
  adminDeckZonesRouter,
  adminDistributionChannelsRouter,
  adminDomainsRouter,
  adminFeatureFlagsRouter,
  adminFinishesRouter,
  adminFormatsRouter,
  adminGrantsRouter,
  adminIgnoredCandidatesRouter,
  adminIgnoredProductsRouter,
  adminImagesRouter,
  adminJobRunsRouter,
  adminJobSchedulesRouter,
  adminKeywordsRouter,
  adminLanguagesRouter,
  adminMarkersRouter,
  adminMarketplaceGroupsRouter,
  adminMetaCandidatesRouter,
  adminMetaCatalogRouter,
  adminMetaRouter,
  adminMetaSubmissionsRouter,
  adminOperationsRouter,
  adminOrganizationsRouter,
  adminPrintingCitationsRouter,
  adminPrintingDeskRouter,
  adminPrintingEventsRouter,
  adminScanRouter,
  adminProductsRouter,
  adminProviderSettingsRouter,
  adminRaritiesRouter,
  adminRulesRouter,
  adminSiteSettingsRouter,
  adminStagingCardOverridesRouter,
  adminStatusRouter,
  adminSuperTypesRouter,
  adminTypographyReviewRouter,
  adminUnifiedMappingsRouter,
  adminUsersRouter,
  cardSubmissionsRouter,
  scanReportsRouter,
  cardTradesRouter,
  cardmarketStockRouter,
  collectionEventsRouter,
  collectionValueHistoryRouter,
  collectionsRouter,
  contactMethodsRouter,
  copiesRouter,
  deckCheckKeysRouter,
  deckCheckPlayerRouter,
  decksRouter,
  deckFoldersRouter,
  friendGroupsRouter,
  listsRouter,
  loansRouter,
  metaSubmissionsRouter,
  organizationsRouter,
  overlayRouter,
  preferencesRouter,
  stagePresetsRouter,
  tierListsRouter,
  tournamentDeckCheckRouter,
  tournamentsRouter,
  userShareRouter,
  cardsRouter,
  catalogRouter,
  publicCollectionsRouter,
  deckCheckClaimRouter,
  deckCheckIngestRouter,
  publicDecksRouter,
  discordBotRouter,
  featureFlagsRouter,
  initRouter,
  landingSummaryRouter,
  metaRouter,
  publicFriendGroupsRouter,
  publicListsRouter,
  publicOverlayRouter,
  publicPodTournamentsRouter,
  pricesRouter,
  productsRouter,
  promosRouter,
  rulesRouter,
  setsRouter,
  siteSettingsRouter,
  scanRouter,
  sitemapRouter,
  publicTierListsRouter,
  publicTournamentsRouter,
  unsubscribeRouter,
  publicUserShareRouter,
};

/** Bound to `log`: oRPC encodes handler throws into a Response, so Hono's
 * `onError` never sees them and the reporting interceptor is the only path to Sentry. */
export function createApiHandler(log: Logger) {
  return new OpenAPIHandler(apiRouter, {
    interceptors: [makeReportingErrorInterceptor(log)],
    clientInterceptors: [cacheControlInterceptor],
  });
}
