import { createRoute } from "@hono/zod-openapi";
import type { JobRunsListResponse, JobRunView } from "@openrift/shared";

import { createApiApp } from "../../openapi.js";
import { jobRunsListResponseSchema, jobRunsQuerySchema } from "./schemas.js";

const listJobRuns = createRoute({
  method: "get",
  path: "/job-runs",
  tags: ["Admin"],
  request: {
    query: jobRunsQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: jobRunsListResponseSchema } },
      description: "Recent job runs",
    },
  },
});

export const adminJobRunsRoute = createApiApp().openapi(listJobRuns, async (c) => {
  const { jobRuns } = c.get("repos");
  const { kind, trigger, status, activity, page, limit } = c.req.valid("query");

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
  return c.json({
    runs,
    total,
    page: pageNumber,
    limit: pageSize,
    kinds,
  } satisfies JobRunsListResponse);
});
