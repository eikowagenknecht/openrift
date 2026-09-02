import { z } from "zod";

import { ADMIN_SECTION_SLUGS } from "../../admin-sections.js";
import { authedRoute } from "../_base.js";

const TAG = "Admin";

export const adminMeResponseSchema = z.object({
  isAdmin: z.boolean(),
  /** Per-section grants for non-full admins; empty for full admins. */
  sections: z.array(z.enum(ADMIN_SECTION_SLUGS)),
});

/**
 * oRPC contract for the admin "core" endpoints (mounted under `/api/admin/v1`,
 * admin-gated by the mount): the `me` admin-status probe. Read-only, with no
 * domain control-flow errors. It is also reachable by users holding per-section
 * admin grants (the gate lets grant holders through to it) so the web app can
 * learn their sections.
 */
export const adminCoreContract = {
  me: authedRoute
    .route({ method: "GET", path: "/api/admin/v1/me", tags: [TAG] })
    .output(adminMeResponseSchema),
};

export type AdminCoreContract = typeof adminCoreContract;
export type AdminMeResponse = z.infer<typeof adminMeResponseSchema>;
