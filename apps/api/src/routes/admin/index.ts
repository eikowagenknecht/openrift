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
import { cardmarketConfig, tcgplayerConfig } from "./marketplace-configs.js";
import { createMappingRoutes } from "./marketplace-mapping.js";
import { operationsRoute } from "./operations.js";

export const adminRoute = new Hono<{ Variables: Variables }>();

// ── GET /admin/cron-status ──────────────────────────────────────────────────

adminRoute.use("/admin/cron-status", requireAdmin);
adminRoute.get("/admin/cron-status", (c) =>
  c.json({
    tcgplayer: cronJobs.tcgplayer
      ? { nextRun: cronJobs.tcgplayer.nextRun()?.toISOString() ?? null }
      : null,
    cardmarket: cronJobs.cardmarket
      ? { nextRun: cronJobs.cardmarket.nextRun()?.toISOString() ?? null }
      : null,
  }),
);

// ── GET /admin/me — any authenticated user ───────────────────────────────────

adminRoute.get("/admin/me", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ isAdmin: false });
  }

  return c.json({ isAdmin: await isAdmin(user.id) });
});

// ── Register marketplace mapping routes ─────────────────────────────────────

createMappingRoutes(adminRoute, "/admin/tcgplayer-mappings", tcgplayerConfig);
createMappingRoutes(adminRoute, "/admin/cardmarket-mappings", cardmarketConfig);

// ── Mount sub-routes ────────────────────────────────────────────────────────

adminRoute.route("/", featureFlagsRoute);
adminRoute.route("/", ignoredProductsRoute);
adminRoute.route("/", catalogRoute);
adminRoute.route("/", operationsRoute);

// ── Card source routes ──────────────────────────────────────────────────────

adminRoute.use("/admin/card-sources/*", requireAdmin);
adminRoute.use("/admin/card-sources", requireAdmin);
adminRoute.route("/admin", cardSourcesRoute);
