import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Operations";

/**
 * oRPC contract for the admin changelog Discord post action (mounted at
 * `/api/admin/v1/changelog/post`, admin-gated by the mount). Posts pending
 * changelog entries (oldest first) to the configured Discord webhook. No
 * domain control-flow errors are declared.
 */
export const adminChangelogContract = {
  post: authedRoute
    .route({ method: "POST", path: "/api/admin/v1/changelog/post", tags: [TAG] })
    .output(z.object({ posted: z.boolean(), count: z.number() })),
};

export type AdminChangelogContract = typeof adminChangelogContract;
