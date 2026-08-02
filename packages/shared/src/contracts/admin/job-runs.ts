import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin";

/** What started a job run. Mirrors the `job_runs.trigger` CHECK. */
export const JOB_TRIGGERS = ["cron", "admin", "api"] as const;
/** Lifecycle of a job run. Mirrors the `job_runs.status` CHECK. */
export const JOB_STATUSES = ["running", "succeeded", "failed"] as const;
/** Derived filter over `job_runs.noop`, not a stored column. */
export const JOB_RUN_ACTIVITIES = ["did-work", "noop"] as const;

const triggerEnum = z.enum(JOB_TRIGGERS);
const statusEnum = z.enum(JOB_STATUSES);
const activityEnum = z.enum(JOB_RUN_ACTIVITIES);

const jobRunViewSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  trigger: triggerEnum,
  status: statusEnum,
  startedAt: isoDateTime,
  finishedAt: isoDateTime.nullable(),
  durationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  result: z.record(z.string(), z.any()).nullable(),
  /** Activity: true = succeeded but no work done, false = did work, null = not
   *  classified (failures, jobs without a classifier, pre-migration rows). */
  noop: z.boolean().nullable(),
});

const jobRunsListResponseSchema = z.object({
  runs: z.array(jobRunViewSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  kinds: z.array(z.string()),
});

const jobRunsQuerySchema = z.object({
  kind: z.string().optional(),
  trigger: triggerEnum.optional(),
  status: statusEnum.optional(),
  /** "did-work" keeps only runs that did something, "noop" only the idle ones. */
  activity: activityEnum.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * oRPC contract for the admin job-runs table (mounted at
 * `/api/admin/v1/job-runs`, admin-gated by the mount). All procedures share
 * the `authedRoute` base (UNAUTHORIZED + FORBIDDEN). Read-only, paginated +
 * filterable.
 */
export const adminJobRunsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/admin/v1/job-runs", tags: [TAG] })
    .input(jobRunsQuerySchema)
    .output(jobRunsListResponseSchema),
};

export type AdminJobRunsContract = typeof adminJobRunsContract;
export type JobRunsListResponse = z.infer<typeof jobRunsListResponseSchema>;
export type JobRunView = z.infer<typeof jobRunViewSchema>;
export type JobRunsQuery = z.infer<typeof jobRunsQuerySchema>;
export type JobTrigger = (typeof JOB_TRIGGERS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobRunActivity = (typeof JOB_RUN_ACTIVITIES)[number];
