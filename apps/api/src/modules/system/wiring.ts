import type { Kysely } from "kysely";

import type { Database } from "../../db/index.js";
import { adminEventsRepo } from "./repositories/admin-events.js";
import { healthRepo } from "./repositories/health.js";
import { jobRunsRepo } from "./repositories/job-runs.js";
import { jobSchedulesRepo } from "./repositories/job-schedules.js";
import { siteSettingsRepo } from "./repositories/site-settings.js";
import { statusRepo } from "./repositories/status.js";
import { logEvents } from "./services/event-logger.js";

export interface SystemRepos {
  adminEvents: ReturnType<typeof adminEventsRepo>;
  health: ReturnType<typeof healthRepo>;
  status: ReturnType<typeof statusRepo>;
  siteSettings: ReturnType<typeof siteSettingsRepo>;
  jobRuns: ReturnType<typeof jobRunsRepo>;
  jobSchedules: ReturnType<typeof jobSchedulesRepo>;
}

export interface SystemServices {
  logEvents: typeof logEvents;
}

export function createSystemRepos(db: Kysely<Database>): SystemRepos {
  return {
    adminEvents: adminEventsRepo(db),
    health: healthRepo(db),
    status: statusRepo(db),
    siteSettings: siteSettingsRepo(db),
    jobRuns: jobRunsRepo(db),
    jobSchedules: jobSchedulesRepo(db),
  };
}

export function createSystemServices(): SystemServices {
  return { logEvents };
}
