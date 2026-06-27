import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

const lastJobRunSchema = z.object({
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  status: z.enum(["running", "succeeded", "failed"]),
  errorMessage: z.string().nullable(),
});

const cronJobStatusSchema = z.object({
  enabled: z.boolean(),
  nextRun: z.string().nullable(),
  lastRun: lastJobRunSchema.nullable(),
});

export const adminStatusResponseSchema = z
  .object({
    server: z.object({
      uptimeSeconds: z.number(),
      memoryMb: z.object({
        rss: z.number(),
        heapUsed: z.number(),
        heapTotal: z.number(),
      }),
      bunVersion: z.string(),
      environment: z.string(),
    }),
    database: z.object({
      status: z.string(),
      sizeMb: z.number().nullable(),
      activeConnections: z.number().nullable(),
      latestMigration: z.string().nullable(),
      totalMigrations: z.number(),
    }),
    cron: z.object({
      jobs: z.object({
        tcgplayer: cronJobStatusSchema,
        cardmarket: cronJobStatusSchema,
        cardtrader: cronJobStatusSchema,
        printingEvents: cronJobStatusSchema,
        changelog: cronJobStatusSchema,
        jobRunsCleanup: cronJobStatusSchema,
      }),
    }),
    app: z.object({
      totalUsers: z.number(),
      recentSignups7d: z.number(),
      totalCards: z.number(),
      totalPrintings: z.number(),
      totalSets: z.number(),
      totalCollections: z.number(),
      totalDecks: z.number(),
      totalCopies: z.number(),
    }),
    pricing: z.object({
      totalPrices: z.number(),
      sources: z.array(
        z.object({
          marketplace: z.string(),
          products: z.number(),
          prices: z.number(),
          latestPrice: z.string().nullable(),
        }),
      ),
    }),
  })
  .openapi("AdminStatusResponse");

const TAG = "Admin";

/**
 * oRPC contract for the admin status dashboard (mounted at
 * `/api/admin/v1/status`, admin-gated by the mount). Read-only: aggregates
 * server/runtime, database, cron, app, and pricing stats. Reuses the shared
 * {@link adminStatusResponseSchema}.
 */
export const adminStatusContract = {
  get: oc
    .route({ method: "GET", path: "/api/admin/v1/status", tags: [TAG] })
    .output(adminStatusResponseSchema),
};

export type AdminStatusContract = typeof adminStatusContract;
export type AdminStatusResponse = z.infer<typeof adminStatusResponseSchema>;
