import { z } from "zod";

import { ADMIN_SECTION_SLUGS } from "../../admin-sections.js";
import { authedRoute } from "../_base.js";

const TAG = "Admin";

export const adminMeResponseSchema = z.object({
  isAdmin: z.boolean(),
  sections: z.array(z.enum(ADMIN_SECTION_SLUGS)),
});

/**
 * Also reachable by users holding per-section admin grants (the mount's gate
 * lets grant holders through) so the web app can learn their sections.
 */
export const adminCoreContract = {
  me: authedRoute
    .route({ method: "GET", path: "/api/admin/v1/me", tags: [TAG] })
    .output(adminMeResponseSchema),
};

export type AdminCoreContract = typeof adminCoreContract;
export type AdminMeResponse = z.infer<typeof adminMeResponseSchema>;
