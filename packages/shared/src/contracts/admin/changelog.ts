import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Operations";

/**
 * oRPC contract for the admin changelog Discord post action (mounted at
 * `/api/admin/v1/changelog/post`, admin-gated by the mount). Posts pending
 * changelog entries (oldest first) to the configured Discord webhook.
 *
 * `post` → CONFLICT (a run of the job is already in flight). A post that fails
 * outright is a server fault and stays an undeclared 500, per the base
 * contract's note on 5xx codes.
 */
export const adminChangelogContract = {
  post: authedRoute
    .route({ method: "POST", path: "/api/admin/v1/changelog/post", tags: [TAG] })
    .errors({ CONFLICT: { message: "A changelog post is already running" } })
    .output(z.object({ posted: z.boolean(), count: z.number() })),
};

export type AdminChangelogContract = typeof adminChangelogContract;
