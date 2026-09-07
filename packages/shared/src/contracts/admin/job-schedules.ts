import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { JOB_STATUSES } from "./job-runs.js";

const TAG = "Admin - Job Schedules";

const JS = "/api/admin/v1/job-schedules";

/** Every job the API can run on a schedule. Mirrors `job_runs.kind` for those jobs. */
export const SCHEDULED_JOB_KINDS = [
  "tcgplayer.refresh",
  "cardmarket.refresh",
  "cardtrader.refresh",
  "discord.post_changelog",
  "discord.flush_printing_events",
  "job_runs.cleanup",
  "card_trades.expire_pending",
  "email.trade_match_digest",
  "email.flush_trade_requests",
  "email.flush_trade_status",
  "meta.uvsgames_sync",
  "meta.uvsgames_recheck",
  "meta.playloltcg_sync",
  "meta.playloltcg_recheck",
  "meta.topdeck_sync",
] as const;

export const scheduledJobKindSchema = z.enum(SCHEDULED_JOB_KINDS);

const lastRunSchema = z
  .object({
    startedAt: isoDateTime,
    finishedAt: isoDateTime.nullable(),
    durationMs: z.number().nullable(),
    status: z.enum(JOB_STATUSES),
    errorMessage: z.string().nullable(),
  })
  .nullable();

export const jobScheduleViewSchema = z.object({
  kind: scheduledJobKindSchema,
  title: z.string(),
  description: z.string(),
  /** Five-field cron expression, UTC. */
  suggestedSchedule: z.string(),
  schedule: z.string().nullable(),
  available: z.boolean(),
  unavailableReason: z.string().nullable(),
  nextRun: isoDateTime.nullable(),
  lastRun: lastRunSchema,
  updatedAt: isoDateTime.nullable(),
});

const jobSchedulesListResponseSchema = z.object({
  jobs: z.array(jobScheduleViewSchema),
});

const kindInputSchema = z.object({ kind: scheduledJobKindSchema });

/**
 * Admin job-schedules page, mounted at `/api/admin/v1/job-schedules`. A job
 * is off unless it has a stored schedule.
 */
export const adminJobSchedulesContract = {
  list: authedRoute
    .route({ method: "GET", path: JS, tags: [TAG] })
    .output(jobSchedulesListResponseSchema),
  set: authedRoute
    .route({ method: "PUT", path: `${JS}/{kind}`, tags: [TAG] })
    .errors({ BAD_REQUEST: { message: "Invalid schedule" } })
    .input(kindInputSchema.extend({ schedule: z.string().trim().min(1).max(100) }))
    .output(jobScheduleViewSchema),
  disable: authedRoute
    .route({ method: "DELETE", path: `${JS}/{kind}`, tags: [TAG] })
    .input(kindInputSchema)
    .output(jobScheduleViewSchema),
  enableSuggested: authedRoute
    .route({ method: "POST", path: `${JS}/enable-suggested`, tags: [TAG] })
    .output(jobSchedulesListResponseSchema),
  runNow: authedRoute
    .route({ method: "POST", path: `${JS}/{kind}/run`, tags: [TAG], successStatus: 202 })
    .errors({ BAD_REQUEST: { message: "Job unavailable" } })
    .input(kindInputSchema)
    .output(z.object({ runId: z.string(), status: z.enum(["running", "already_running"]) })),
};

export type AdminJobSchedulesContract = typeof adminJobSchedulesContract;
export type ScheduledJobKind = (typeof SCHEDULED_JOB_KINDS)[number];
export type JobScheduleView = z.infer<typeof jobScheduleViewSchema>;
export type JobSchedulesListResponse = z.infer<typeof jobSchedulesListResponseSchema>;
