import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { cronJobs } from "../../cron-jobs.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { isAdmin, requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { cardSourcesRoute } from "../card-sources.js";
import { catalogRoute } from "./catalog.js";
import { featureFlagsRoute } from "./feature-flags.js";
import { ignoredProductsRoute } from "./ignored-products.js";
import { marketplaceGroupsRoute } from "./marketplace-groups.js";
import { cardmarketMappingsRoute, tcgplayerMappingsRoute } from "./marketplace-mapping.js";
import { operationsRoute } from "./operations.js";
import { unifiedMappingsRoute } from "./unified-mappings.js";

export const adminRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/cron-status ────────────────────────────────────────────────

  .use("/admin/cron-status", requireAdmin)
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

  // ── GET /admin/me — any authenticated user ────────────────────────────────

  .get("/admin/me", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ isAdmin: false });
    }

    return c.json({ isAdmin: await isAdmin(user.id) });
  })

  // ── Mount sub-routes ──────────────────────────────────────────────────────

  .route("/", tcgplayerMappingsRoute)
  .route("/", cardmarketMappingsRoute)
  .route("/", featureFlagsRoute)
  .route("/", ignoredProductsRoute)
  .route("/", catalogRoute)
  .route("/", operationsRoute)
  .route("/", marketplaceGroupsRoute)
  .route("/", unifiedMappingsRoute)

  // ── Card source routes ────────────────────────────────────────────────────

  .use("/admin/card-sources/*", requireAdmin)
  .use("/admin/card-sources", requireAdmin)
  .route("/admin", cardSourcesRoute);
