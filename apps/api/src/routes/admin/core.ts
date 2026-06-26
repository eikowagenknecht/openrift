import { adminCoreContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { cronJobs } from "../../cron-jobs.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminCoreContract).$context<ApiContext>().use(requireUser);

/**
 * Admin "core" endpoints. Both are pure reads that never throw `AppError` (no
 * service calls), so no error bridging is needed. `me` always returns
 * `{ isAdmin: true }` — reaching the handler means the `requireAdmin` mount
 * gate already passed.
 */
export const adminCoreRouter = {
  me: os.me.handler(() => ({ isAdmin: true })),

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
