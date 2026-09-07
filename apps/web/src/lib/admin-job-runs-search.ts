import {
  JOB_RUN_ACTIVITIES,
  JOB_STATUSES,
  JOB_TRIGGERS,
} from "@openrift/shared/contracts/admin/job-runs";
import { z } from "zod";

/** Every param carries a `run` prefix: plain `status` already names something else on the admin cards tab. */
export const jobRunsSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  runKind: z.string().optional(),
  runPrefix: z.string().optional(),
  runTrigger: z.enum(JOB_TRIGGERS).optional(),
  runStatus: z.enum(JOB_STATUSES).optional(),
  runActivity: z.enum(JOB_RUN_ACTIVITIES).optional(),
});

export type JobRunsSearch = z.infer<typeof jobRunsSearchSchema>;
