import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { adminStatusResponseSchema } from "@openrift/shared/response-schemas";

import { cronJobs } from "../../cron-jobs.js";
import type { Variables } from "../../types.js";

const getStatus = createRoute({
  method: "get",
  path: "/status",
  tags: ["Admin"],
  responses: {
    200: {
      content: { "application/json": { schema: adminStatusResponseSchema } },
      description: "Server status dashboard",
    },
  },
});

export const adminStatusRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getStatus,
  async (c) => {
    const { status } = c.get("repos");
    const config = c.get("config");

    const [dbStatus, appStats, pricingStats] = await Promise.all([
      status.getDatabaseStatus(),
      status.getAppStats(),
      status.getPricingStats(),
    ]);

    const mem = process.memoryUsage();

    return c.json({
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: {
          rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        },
        bunVersion: Bun.version,
        environment: config.isDev ? "development" : "production",
      },
      database: dbStatus,
      cron: {
        enabled: config.cron.enabled,
        jobs: {
          tcgplayer: {
            enabled: cronJobs.tcgplayer !== null,
            nextRun: cronJobs.tcgplayer?.nextRun()?.toISOString() ?? null,
          },
          cardmarket: {
            enabled: cronJobs.cardmarket !== null,
            nextRun: cronJobs.cardmarket?.nextRun()?.toISOString() ?? null,
          },
          cardtrader: {
            enabled: cronJobs.cardtrader !== null,
            nextRun: cronJobs.cardtrader?.nextRun()?.toISOString() ?? null,
          },
        },
      },
      app: appStats,
      pricing: pricingStats,
    });
  },
);
