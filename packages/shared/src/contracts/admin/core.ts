import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin";

const cronJobStatusSchema = z.object({ nextRun: z.string().nullable() }).nullable();

const cronStatusResponseSchema = z.object({
  tcgplayer: cronJobStatusSchema,
  cardmarket: cronJobStatusSchema,
  cardtrader: cronJobStatusSchema,
  changelog: cronJobStatusSchema,
});

/**
 * oRPC contract for the admin "core" endpoints (mounted under `/api/admin/v1`,
 * admin-gated by the mount): the `me` admin-status probe and the `cron-status`
 * dashboard read. Both are read-only.
 */
export const adminCoreContract = {
  me: oc
    .route({ method: "GET", path: "/api/admin/v1/me", tags: [TAG] })
    .output(z.object({ isAdmin: z.boolean() })),

  cronStatus: oc
    .route({ method: "GET", path: "/api/admin/v1/cron-status", tags: [TAG] })
    .output(cronStatusResponseSchema),
};

export type AdminCoreContract = typeof adminCoreContract;
