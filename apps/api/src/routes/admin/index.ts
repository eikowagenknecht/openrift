import { Hono } from "hono";

import { cronJobs } from "../../cron-jobs.js";
import { requireAdmin } from "../../middleware/require-admin.js";
import type { Variables } from "../../types.js";
import { cardSourcesRoute } from "../card-sources/index.js";
import { catalogRoute } from "./catalog.js";
import { adminFeatureFlagsRoute } from "./feature-flags.js";
import { ignoredProductsRoute } from "./ignored-products.js";
import { ignoredSourcesRoute } from "./ignored-sources.js";
import { imagesRoute } from "./images.js";
import { marketplaceGroupsRoute } from "./marketplace-groups.js";
import { operationsRoute } from "./operations.js";
import { adminPromoTypesRoute } from "./promo-types.js";
import { adminSourceSettingsRoute } from "./source-settings.js";
import { stagingCardOverridesRoute } from "./staging-card-overrides.js";
import { unifiedMappingsRoute } from "./unified-mappings.js";

export const adminRoute = new Hono<{ Variables: Variables }>()

  // ── Auth: all /admin/* routes require admin ───────────────────────────────

  .use("/admin/*", requireAdmin)

  // ── GET /admin/me ─────────────────────────────────────────────────────────

  .get("/admin/me", (c) => c.json({ isAdmin: true }))

  // ── GET /admin/cron-status ────────────────────────────────────────────────

  .get("/admin/cron-status", (c) =>
    c.json({
      tcgplayer: cronJobs.tcgplayer
        ? { nextRun: cronJobs.tcgplayer.nextRun()?.toISOString() ?? null }
        : null,
      cardmarket: cronJobs.cardmarket
        ? { nextRun: cronJobs.cardmarket.nextRun()?.toISOString() ?? null }
        : null,
    }),
  )

  // ── Mount sub-routes ──────────────────────────────────────────────────────

  .route("/", adminFeatureFlagsRoute)
  .route("/", ignoredProductsRoute)
  .route("/", ignoredSourcesRoute)
  .route("/", catalogRoute) // catalogRoute uses .basePath("/admin")
  .route("/", operationsRoute)
  .route("/", imagesRoute)
  .route("/", marketplaceGroupsRoute)
  .route("/", unifiedMappingsRoute)
  .route("/", adminPromoTypesRoute)
  .route("/", adminSourceSettingsRoute)
  .route("/", stagingCardOverridesRoute)

  // ── Card source routes ────────────────────────────────────────────────────

  .route("/admin", cardSourcesRoute);
