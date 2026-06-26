import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin";

const triggerEnum = z.enum(["cron", "admin", "api"]);
const statusEnum = z.enum(["running", "succeeded", "failed"]);

const jobRunViewSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  trigger: triggerEnum,
  status: statusEnum,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
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
  activity: z.enum(["did-work", "noop"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * oRPC contract for the admin job-runs table (mounted at
 * `/api/admin/v1/job-runs`, admin-gated by the mount). Read-only, paginated +
 * filterable.
 */
export const adminJobRunsContract = {
  list: oc
    .route({ method: "GET", path: "/api/admin/v1/job-runs", tags: [TAG] })
    .input(jobRunsQuerySchema)
    .output(jobRunsListResponseSchema),
};

export type AdminJobRunsContract = typeof adminJobRunsContract;
export type JobRunsListResponse = z.infer<typeof jobRunsListResponseSchema>;
export type JobRunView = z.infer<typeof jobRunViewSchema>;
