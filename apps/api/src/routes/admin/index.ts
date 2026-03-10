import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { cronJobs } from "../../cron-jobs.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { candidatesRoute } from "../candidates.js";
import { catalogRoute } from "./catalog.js";
import { ignoredProductsRoute } from "./ignored-products.js";
import { cardmarketConfig, createMappingRoutes, tcgplayerConfig } from "./marketplace-mapping.js";
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
    catalog: null,
  }),
);

// ── GET /admin/me — any authenticated user ───────────────────────────────────

adminRoute.get("/admin/me", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ isAdmin: false });
  }

  const admin = await db
    .selectFrom("admins")
    .select("user_id")
    .where("user_id", "=", user.id)
    .executeTakeFirst();

  return c.json({ isAdmin: Boolean(admin) });
});

// ── Register marketplace mapping routes ─────────────────────────────────────

createMappingRoutes(adminRoute, "/admin/tcgplayer-mappings", tcgplayerConfig);
createMappingRoutes(adminRoute, "/admin/cm-mappings", cardmarketConfig);

// ── Mount sub-routes ────────────────────────────────────────────────────────

adminRoute.route("/", ignoredProductsRoute);
adminRoute.route("/", catalogRoute);
adminRoute.route("/", operationsRoute);

// ── Candidate import routes ─────────────────────────────────────────────────

adminRoute.use("/admin/candidates/*", requireAdmin);
adminRoute.use("/admin/candidates", requireAdmin);
adminRoute.route("/admin", candidatesRoute);
