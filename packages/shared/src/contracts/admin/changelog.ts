import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Operations";

/** A post that fails outright is a server fault and stays an undeclared 500. */
export const adminChangelogContract = {
  post: authedRoute
    .route({ method: "POST", path: "/api/admin/v1/changelog/post", tags: [TAG] })
    .errors({ CONFLICT: { message: "A changelog post is already running" } })
    .output(z.object({ posted: z.boolean(), count: z.number() })),
};

export type AdminChangelogContract = typeof adminChangelogContract;
