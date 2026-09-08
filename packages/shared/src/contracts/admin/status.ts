import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "../_base.js";

extendZodWithOpenApi(z);

export const adminAppStatsSchema = z.object({
  totalUsers: z.number(),
  recentSignups7d: z.number(),
  totalCards: z.number(),
  totalPrintings: z.number(),
  totalSets: z.number(),
  totalCollections: z.number(),
  totalDecks: z.number(),
  totalCopies: z.number(),
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
    app: adminAppStatsSchema,
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

export const adminStatusContract = {
  get: authedRoute
    .route({ method: "GET", path: "/api/admin/v1/status", tags: [TAG] })
    .output(adminStatusResponseSchema),
};

export type AdminStatusContract = typeof adminStatusContract;
export type AdminStatusResponse = z.infer<typeof adminStatusResponseSchema>;
