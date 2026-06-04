import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { cronJobs } from "../../cron-jobs.js";
import { requireAdmin } from "../../middleware/require-admin.js";
import { createApiApp } from "../../openapi.js";
import { adminArtVariantsRoute } from "./art-variants.js";
import { adminCacheRoute } from "./cache.js";
import { adminCardTypesRoute } from "./card-types.js";
import { adminCardsRoute } from "./cards/index.js";
import { catalogRoute } from "./catalog.js";
import { adminChangelogRoute } from "./changelog.js";
import { adminCustomTagsRoute } from "./custom-tags.js";
import { adminDeckFormatsRoute } from "./deck-formats.js";
import { adminDeckZonesRoute } from "./deck-zones.js";
import { adminDistributionChannelsRoute } from "./distribution-channels.js";
import { adminDomainsRoute } from "./domains.js";
import { adminFeatureFlagsRoute } from "./feature-flags.js";
import { adminFinishesRoute } from "./finishes.js";
import { adminFormatsRoute } from "./formats.js";
import { ignoredCandidatesRoute } from "./ignored-candidates.js";
import { ignoredProductsRoute } from "./ignored-products.js";
import { imagesRoute } from "./images.js";
import { adminJobRunsRoute } from "./job-runs.js";
import { adminKeywordsRoute } from "./keywords.js";
import { adminLanguagesRoute } from "./languages.js";
import { adminMarkersRoute } from "./markers.js";
import { marketplaceGroupsRoute } from "./marketplace-groups.js";
import { operationsRoute } from "./operations.js";
import { adminPrintingEventsRoute } from "./printing-events.js";
import { adminProviderSettingsRoute } from "./provider-settings.js";
import { adminRaritiesRoute } from "./rarities.js";
import { adminRulesRoute } from "./rules.js";
import { adminSentryTestRoute } from "./sentry-test.js";
import { adminSiteSettingsRoute } from "./site-settings.js";
import { stagingCardOverridesRoute } from "./staging-card-overrides.js";
import { adminStatusRoute } from "./status.js";
import { adminSuperTypesRoute } from "./super-types.js";
import { typographyReviewRoute } from "./typography-review.js";
import { unifiedMappingsRoute } from "./unified-mappings.js";
import { adminUserFeatureFlagsRoute } from "./user-feature-flags.js";
import { adminUsersRoute } from "./users.js";

// ── Route definitions ────────────────────────────────────────────────────────

const getMe = createRoute({
  method: "get",
  path: "/me",
  tags: ["Admin"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ isAdmin: z.boolean() }),
        },
      },
      description: "Admin status",
    },
  },
});

const getCronStatus = createRoute({
  method: "get",
  path: "/cron-status",
  tags: ["Admin"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            tcgplayer: z.object({ nextRun: z.string().nullable() }).nullable(),
            cardmarket: z.object({ nextRun: z.string().nullable() }).nullable(),
            cardtrader: z.object({ nextRun: z.string().nullable() }).nullable(),
            changelog: z.object({ nextRun: z.string().nullable() }).nullable(),
          }),
        },
      },
      description: "Cron job status",
    },
  },
});

// ── Router ───────────────────────────────────────────────────────────────────

const app = createApiApp();

// ── Auth: the whole admin app requires admin (mounted at /api/admin/v1) ────
app.use("/*", requireAdmin);

// Route chain is assigned so TypeScript preserves the full route type map.
export const adminRoute = app
  // ── GET /admin/me ─────────────────────────────────────────────────────────
  .openapi(getMe, (c) => c.json({ isAdmin: true }))

  // ── GET /admin/cron-status ────────────────────────────────────────────────
  .openapi(getCronStatus, (c) =>
    c.json({
      tcgplayer: cronJobs.tcgplayer
        ? { nextRun: cronJobs.tcgplayer.nextRun()?.toISOString() ?? null }
        : null,
      cardmarket: cronJobs.cardmarket
        ? { nextRun: cronJobs.cardmarket.nextRun()?.toISOString() ?? null }
        : null,
      cardtrader: cronJobs.cardtrader
        ? { nextRun: cronJobs.cardtrader.nextRun()?.toISOString() ?? null }
        : null,
      changelog: cronJobs.changelog
        ? { nextRun: cronJobs.changelog.nextRun()?.toISOString() ?? null }
        : null,
    }),
  )

  // ── Mount sub-routes ──────────────────────────────────────────────────────
  .route("/", adminFormatsRoute)
  .route("/", adminFeatureFlagsRoute)
  .route("/", ignoredProductsRoute)
  .route("/", ignoredCandidatesRoute)
  .route("/", catalogRoute)
  .route("/", operationsRoute)
  .route("/", imagesRoute)
  .route("/", marketplaceGroupsRoute)
  .route("/", unifiedMappingsRoute)
  .route("/", adminLanguagesRoute)
  .route("/", adminMarkersRoute)
  .route("/", adminCustomTagsRoute)
  .route("/", adminDistributionChannelsRoute)
  .route("/", adminProviderSettingsRoute)
  .route("/", adminSiteSettingsRoute)
  .route("/", adminPrintingEventsRoute)
  .route("/", adminChangelogRoute)
  .route("/", adminSentryTestRoute)
  .route("/", stagingCardOverridesRoute)
  .route("/", typographyReviewRoute)
  .route("/", adminDeckZonesRoute)
  .route("/", adminCardsRoute)
  .route("/", adminUsersRoute)
  .route("/", adminUserFeatureFlagsRoute)
  .route("/", adminRulesRoute)
  .route("/", adminStatusRoute)
  .route("/", adminJobRunsRoute)
  .route("/", adminKeywordsRoute)
  .route("/", adminFinishesRoute)
  .route("/", adminArtVariantsRoute)
  .route("/", adminDomainsRoute)
  .route("/", adminRaritiesRoute)
  .route("/", adminCardTypesRoute)
  .route("/", adminSuperTypesRoute)
  .route("/", adminDeckFormatsRoute)
  .route("/", adminCacheRoute);
