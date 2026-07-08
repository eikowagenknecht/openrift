// AUTO-ASSEMBLED router: every domain oRPC router merged into one, served by a
// single OpenAPIHandler + single catch-all mount (see app.ts). Auth is enforced
// per-procedure by the requireUser middleware each router carries (fail-closed);
// the reporting error interceptor captures 5xx faults to Sentry and maps thrown
// AppError -> ORPCError at this one boundary.
import type { Logger } from "@openrift/shared/logger";
import { OpenAPIHandler } from "@orpc/openapi/fetch";

import { adminArtVariantsRouter } from "../routes/admin/art-variants.js";
import { adminCacheRouter } from "../routes/admin/cache.js";
import { adminCardTypesRouter } from "../routes/admin/card-types.js";
import { adminCardBansRouter } from "../routes/admin/cards/bans.js";
import { adminCardImagesRouter } from "../routes/admin/cards/images.js";
import { adminCardMutationsRouter } from "../routes/admin/cards/mutations.js";
import { adminCardQueriesRouter } from "../routes/admin/cards/queries.js";
import { adminCatalogRouter } from "../routes/admin/catalog.js";
import { adminChangelogRouter } from "../routes/admin/changelog.js";
import { adminCoreRouter } from "../routes/admin/core.js";
import { adminCustomTagsRouter } from "../routes/admin/custom-tags.js";
import { adminDeckFormatsRouter } from "../routes/admin/deck-formats.js";
import { adminDeckZonesRouter } from "../routes/admin/deck-zones.js";
import { adminDistributionChannelsRouter } from "../routes/admin/distribution-channels.js";
import { adminDomainsRouter } from "../routes/admin/domains.js";
import { adminFeatureFlagsRouter } from "../routes/admin/feature-flags.js";
import { adminFinishesRouter } from "../routes/admin/finishes.js";
import { adminFormatsRouter } from "../routes/admin/formats.js";
import { adminIgnoredCandidatesRouter } from "../routes/admin/ignored-candidates.js";
import { adminIgnoredProductsRouter } from "../routes/admin/ignored-products.js";
import { adminImagesRouter } from "../routes/admin/images.js";
import { adminJobRunsRouter } from "../routes/admin/job-runs.js";
import { adminKeywordsRouter } from "../routes/admin/keywords.js";
import { adminLanguagesRouter } from "../routes/admin/languages.js";
import { adminMarkersRouter } from "../routes/admin/markers.js";
import { adminMarketplaceGroupsRouter } from "../routes/admin/marketplace-groups.js";
import { adminOperationsRouter } from "../routes/admin/operations.js";
import { adminOrganizationsRouter } from "../routes/admin/organizations.js";
import { adminPrintingEventsRouter } from "../routes/admin/printing-events.js";
import { adminProviderSettingsRouter } from "../routes/admin/provider-settings.js";
import { adminRaritiesRouter } from "../routes/admin/rarities.js";
import { adminRulesRouter } from "../routes/admin/rules.js";
import { adminSiteSettingsRouter } from "../routes/admin/site-settings.js";
import { adminStagingCardOverridesRouter } from "../routes/admin/staging-card-overrides.js";
import { adminStatusRouter } from "../routes/admin/status.js";
import { adminSuperTypesRouter } from "../routes/admin/super-types.js";
import { adminTypographyReviewRouter } from "../routes/admin/typography-review.js";
import { adminUnifiedMappingsRouter } from "../routes/admin/unified-mappings.js";
import { adminUsersRouter } from "../routes/admin/users.js";
import { cardSubmissionsRouter } from "../routes/authenticated/card-submissions.js";
import { cardTradesRouter } from "../routes/authenticated/card-trades.js";
import { collectionEventsRouter } from "../routes/authenticated/collection-events.js";
import { collectionValueHistoryRouter } from "../routes/authenticated/collection-value-history.js";
import { collectionsRouter } from "../routes/authenticated/collections.js";
import { contactMethodsRouter } from "../routes/authenticated/contact-methods.js";
import { copiesRouter } from "../routes/authenticated/copies.js";
import { deckCheckKeysRouter } from "../routes/authenticated/deck-check-keys.js";
import { deckCheckPlayerRouter } from "../routes/authenticated/deck-check-player.js";
import { decksRouter } from "../routes/authenticated/decks.js";
import { friendGroupsRouter } from "../routes/authenticated/friend-groups.js";
import { listsRouter } from "../routes/authenticated/lists.js";
import { loansRouter } from "../routes/authenticated/loans.js";
import { organizationsRouter } from "../routes/authenticated/organizations.js";
import { preferencesRouter } from "../routes/authenticated/preferences.js";
import { tournamentDeckCheckRouter } from "../routes/authenticated/tournament-deck-check.js";
import { tournamentsRouter } from "../routes/authenticated/tournaments.js";
import { userShareRouter } from "../routes/authenticated/user-share.js";
import { cardsRouter } from "../routes/public/cards.js";
import { catalogRouter } from "../routes/public/catalog.js";
import { publicCollectionsRouter } from "../routes/public/collections.js";
import { deckCheckClaimRouter } from "../routes/public/deck-check-claim.js";
import { deckCheckIngestRouter } from "../routes/public/deck-check-ingest.js";
import { publicDecksRouter } from "../routes/public/decks.js";
import { featureFlagsRouter } from "../routes/public/feature-flags.js";
import { initRouter } from "../routes/public/init.js";
import { landingSummaryRouter } from "../routes/public/landing-summary.js";
import { publicListsRouter } from "../routes/public/lists.js";
import { publicPodTournamentsRouter } from "../routes/public/pod-tournaments.js";
import { pricesRouter } from "../routes/public/prices.js";
import { promosRouter } from "../routes/public/promos.js";
import { rulesRouter } from "../routes/public/rules.js";
import { setsRouter } from "../routes/public/sets.js";
import { siteSettingsRouter } from "../routes/public/site-settings.js";
import { sitemapRouter } from "../routes/public/sitemap.js";
import { publicTournamentsRouter } from "../routes/public/tournaments.js";
import { unsubscribeRouter } from "../routes/public/unsubscribe.js";
import { publicUserShareRouter } from "../routes/public/user-share.js";
import { cacheControlInterceptor } from "./cache-control-interceptor.js";
import { makeReportingErrorInterceptor } from "./error-reporting-interceptor.js";

/**
 * Every migrated oRPC domain router, keyed arbitrarily (OpenAPI paths come from
 * each procedure's contract `.route({ path })`, so the nesting is only for
 * traversal).
 */
const apiRouter = {
  adminArtVariantsRouter,
  adminCacheRouter,
  adminCardTypesRouter,
  adminCardBansRouter,
  adminCardImagesRouter,
  adminCardMutationsRouter,
  adminCardQueriesRouter,
  adminCatalogRouter,
  adminChangelogRouter,
  adminCoreRouter,
  adminCustomTagsRouter,
  adminDeckFormatsRouter,
  adminDeckZonesRouter,
  adminDistributionChannelsRouter,
  adminDomainsRouter,
  adminFeatureFlagsRouter,
  adminFinishesRouter,
  adminFormatsRouter,
  adminIgnoredCandidatesRouter,
  adminIgnoredProductsRouter,
  adminImagesRouter,
  adminJobRunsRouter,
  adminKeywordsRouter,
  adminLanguagesRouter,
  adminMarkersRouter,
  adminMarketplaceGroupsRouter,
  adminOperationsRouter,
  adminOrganizationsRouter,
  adminPrintingEventsRouter,
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
  cardTradesRouter,
  collectionEventsRouter,
  collectionValueHistoryRouter,
  collectionsRouter,
  contactMethodsRouter,
  copiesRouter,
  deckCheckKeysRouter,
  deckCheckPlayerRouter,
  decksRouter,
  friendGroupsRouter,
  listsRouter,
  loansRouter,
  organizationsRouter,
  preferencesRouter,
  tournamentDeckCheckRouter,
  tournamentsRouter,
  userShareRouter,
  cardsRouter,
  catalogRouter,
  publicCollectionsRouter,
  deckCheckClaimRouter,
  deckCheckIngestRouter,
  publicDecksRouter,
  featureFlagsRouter,
  initRouter,
  landingSummaryRouter,
  publicListsRouter,
  publicPodTournamentsRouter,
  pricesRouter,
  promosRouter,
  rulesRouter,
  setsRouter,
  siteSettingsRouter,
  sitemapRouter,
  publicTournamentsRouter,
  unsubscribeRouter,
  publicUserShareRouter,
};

/**
 * Builds the single handler for all oRPC routes, bound to `log` so the reporting
 * interceptor can capture 5xx faults to Sentry + the structured error log that
 * Hono's `onError` can no longer see (oRPC encodes handler throws into a
 * Response). The interceptor also performs the AppError -> ORPCError mapping.
 *
 * The client interceptor runs per matched procedure (the procedure, and so its
 * contract cache meta, in scope) to resolve the public read's `Cache-Control`
 * onto the context for the catch-all to apply.
 * @returns The oRPC handler for the assembled router.
 */
export function createApiHandler(log: Logger) {
  return new OpenAPIHandler(apiRouter, {
    interceptors: [makeReportingErrorInterceptor(log)],
    clientInterceptors: [cacheControlInterceptor],
  });
}
