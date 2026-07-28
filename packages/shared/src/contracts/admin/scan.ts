import { authedRoute } from "../_base.js";
import { jobStartedResponseSchema } from "./shared.js";

const TAG = "Admin - Scan";

/**
 * oRPC contract for scanner-bank administration (mounted under
 * `/api/admin/v1/scan`, admin-gated by the mount): start a full bank rebuild
 * as a background job (202 + run handle). Appends and scheduling can join
 * later; the manual rebuild is the first production path.
 */
export const adminScanContract = {
  rebuildBank: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/scan/rebuild-bank",
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
};

export type AdminScanContract = typeof adminScanContract;
