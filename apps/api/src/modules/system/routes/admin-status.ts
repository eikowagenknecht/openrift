import { adminStatusContract } from "@openrift/shared/contracts/admin/status";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(adminStatusContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin status dashboard. Any thrown `AppError` is mapped to an ORPCError by
 * the handler's {@link appErrorInterceptor}.
 */
export const adminStatusRouter = {
  get: os.get.handler(async ({ context }) => {
    const { status } = context.repos;
    const config = context.config;

    const [dbStatus, appStats, pricingStats] = await Promise.all([
      status.getDatabaseStatus(),
      status.getAppStats(),
      status.getPricingStats(),
    ]);

    const mem = process.memoryUsage();

    return {
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
      app: appStats,
      pricing: pricingStats,
    };
  }),
};
