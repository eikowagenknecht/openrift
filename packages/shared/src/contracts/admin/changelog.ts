import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Operations";

/**
 * oRPC contract for the admin changelog Discord post action (mounted at
 * `/api/admin/v1/changelog/post`, admin-gated by the mount). Posts pending
 * changelog entries (oldest first) to the configured Discord webhook.
 */
export const adminChangelogContract = {
  post: oc
    .route({ method: "POST", path: "/api/admin/v1/changelog/post", tags: [TAG] })
    .output(z.object({ posted: z.boolean(), count: z.number() })),
};

export type AdminChangelogContract = typeof adminChangelogContract;
