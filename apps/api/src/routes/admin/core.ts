import { adminCoreContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { cronJobs } from "../../cron-jobs.js";
import { getAdminAccess } from "../../middleware/require-admin.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminCoreContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin "core" endpoints. Both are pure reads that never throw `AppError` (no
 * service calls), so no error bridging is needed. `me` reports the caller's
 * actual access — full admin, or the per-section grants that let them through
 * the `requireAdmin` mount gate. The lookup hits the gate's 30s cache, so
 * reaching the handler makes it effectively free.
 */
export const adminCoreRouter = {
  me: os.me.handler(({ context }) => getAdminAccess(context.repos, context.userId)),

  cronStatus: os.cronStatus.handler(() => ({
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
  })),
};
