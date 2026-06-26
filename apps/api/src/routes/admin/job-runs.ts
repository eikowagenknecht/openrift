import type { JobRunsListResponse, JobRunView } from "@openrift/shared";
import { adminJobRunsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminJobRunsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the admin job-runs table. Logic unchanged from the
 * previous `@hono/zod-openapi` handler; any thrown `AppError` is mapped by the
 * handler's {@link appErrorInterceptor}.
 */
export const adminJobRunsRouter = {
  list: os.list.handler(async ({ input, context }): Promise<JobRunsListResponse> => {
    const { jobRuns } = context.repos;
    const { kind, trigger, status, activity, page, limit } = input;

    const pageSize = limit ?? 50;
    const pageNumber = page ?? 1;
    const offset = (pageNumber - 1) * pageSize;
    // "did-work" maps to noop=false (excludes unclassified null rows), "noop" to true.
    const noop = activity === undefined ? undefined : activity === "noop";

    const [{ rows, total }, kinds] = await Promise.all([
      jobRuns.listPage({ kind, trigger, status, noop, limit: pageSize, offset }),
      jobRuns.listKinds(),
    ]);
    const runs: JobRunView[] = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      trigger: row.trigger,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      durationMs: row.durationMs,
      errorMessage: row.errorMessage,
      result:
        row.result === null || typeof row.result !== "object"
          ? null
          : (row.result as Record<string, unknown>),
      noop: row.noop,
    }));
    return { runs, total, page: pageNumber, limit: pageSize, kinds };
  }),
};
