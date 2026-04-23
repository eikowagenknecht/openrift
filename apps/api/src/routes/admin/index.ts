import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { cronJobs } from "../../cron-jobs.js";
import { requireAdmin } from "../../middleware/require-admin.js";
import type { Variables } from "../../types.js";
import { adminArtVariantsRoute } from "./art-variants.js";
import { adminCacheRoute } from "./cache.js";
import { adminCardTypesRoute } from "./card-types.js";
import { adminCardsRoute } from "./cards/index.js";
import { catalogRoute } from "./catalog.js";
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
import { adminKeywordsRoute } from "./keywords.js";
import { adminLanguagesRoute } from "./languages.js";
import { adminMarkersRoute } from "./markers.js";
import { marketplaceGroupsRoute } from "./marketplace-groups.js";
import { operationsRoute } from "./operations.js";
import { adminPrintingEventsRoute } from "./printing-events.js";
import { adminProviderSettingsRoute } from "./provider-settings.js";
import { adminRaritiesRoute } from "./rarities.js";
import { adminRulesRoute } from "./rules.js";
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
  path: "/admin/me",
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
  path: "/admin/cron-status",
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

const app = new OpenAPIHono<{ Variables: Variables }>();

// ── Auth: all /admin/* routes require admin ───────────────────────────────
app.use("/admin/*", requireAdmin);

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
  .route("/admin", adminFormatsRoute)
  .route("/admin", adminFeatureFlagsRoute)
  .route("/admin", ignoredProductsRoute)
  .route("/admin", ignoredCandidatesRoute)
  .route("/admin", catalogRoute)
  .route("/admin", operationsRoute)
  .route("/admin", imagesRoute)
  .route("/admin", marketplaceGroupsRoute)
  .route("/admin", unifiedMappingsRoute)
  .route("/admin", adminLanguagesRoute)
  .route("/admin", adminMarkersRoute)
  .route("/admin", adminDistributionChannelsRoute)
  .route("/admin", adminProviderSettingsRoute)
  .route("/admin", adminSiteSettingsRoute)
  .route("/admin", adminPrintingEventsRoute)
  .route("/admin", stagingCardOverridesRoute)
  .route("/admin", typographyReviewRoute)
  .route("/admin", adminDeckZonesRoute)
  .route("/admin", adminCardsRoute)
  .route("/admin", adminUsersRoute)
  .route("/admin", adminUserFeatureFlagsRoute)
  .route("/admin", adminRulesRoute)
  .route("/admin", adminStatusRoute)
  .route("/admin", adminKeywordsRoute)
  .route("/admin", adminFinishesRoute)
  .route("/admin", adminArtVariantsRoute)
  .route("/admin", adminDomainsRoute)
  .route("/admin", adminRaritiesRoute)
  .route("/admin", adminCardTypesRoute)
  .route("/admin", adminSuperTypesRoute)
  .route("/admin", adminDeckFormatsRoute)
  .route("/admin", adminCacheRoute);
