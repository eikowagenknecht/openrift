import type { JobRunsListResponse, JobRunView } from "@openrift/shared/contracts/admin/job-runs";
import { adminJobRunsContract } from "@openrift/shared/contracts/admin/job-runs";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(adminJobRunsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminJobRunsRouter = {
  list: os.list.handler(async ({ input, context }): Promise<JobRunsListResponse> => {
    const { jobRuns } = context.repos;
    const { kind, kindPrefix, trigger, status, activity, page, limit } = input;

    const pageSize = limit ?? 50;
    const pageNumber = page ?? 1;
    const offset = (pageNumber - 1) * pageSize;
    // noop=false excludes rows where noop is null (SQL null <> false).
    const noop = activity === undefined ? undefined : activity === "noop";

    const [{ rows, total }, kinds] = await Promise.all([
      jobRuns.listPage({ kind, kindPrefix, trigger, status, noop, limit: pageSize, offset }),
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
