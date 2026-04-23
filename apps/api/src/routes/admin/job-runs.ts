import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { JobRunsListResponse, JobRunView } from "@openrift/shared";

import type { Variables } from "../../types.js";
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

export const adminJobRunsRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  listJobRuns,
  async (c) => {
    const { jobRuns } = c.get("repos");
    const { kind, limit } = c.req.valid("query");

    const rows = await jobRuns.listRecent({ kind, limit });
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
    }));
    return c.json({ runs } satisfies JobRunsListResponse);
  },
);
