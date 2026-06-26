import { oc } from "@orpc/contract";
import type { z } from "zod";

import { adminStatusResponseSchema } from "../../response-schemas.js";

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
