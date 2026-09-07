import { authedRoute } from "../_base.js";
import { jobStartedResponseSchema } from "./shared.js";

const TAG = "Admin - Scan";

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
