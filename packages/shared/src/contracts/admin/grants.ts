import { z } from "zod";

import { ADMIN_SECTION_SLUGS } from "../../admin-sections.js";
import { authedRoute } from "../_base.js";

const TAG = "Admin - Grants";

const BASE = "/api/admin/v1";

export const adminGrantSchema = z.object({
  userId: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string(),
  section: z.enum(ADMIN_SECTION_SLUGS),
});

const userSectionParamSchema = z.object({
  id: z.string().min(1),
  section: z.enum(ADMIN_SECTION_SLUGS),
});

/**
 * Per-section admin grants, mounted under `/api/admin/v1`. Reachable by full
 * admins only: the mount's gate lets section-grant holders through only to
 * their granted section's paths, which never include this surface.
 */
export const adminGrantsContract = {
  list: authedRoute
    .route({ method: "GET", path: `${BASE}/admin-grants`, tags: [TAG] })
    .output(z.object({ grants: z.array(adminGrantSchema) })),
  add: authedRoute
    .route({
      method: "PUT",
      path: `${BASE}/users/{id}/admin-grants/{section}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "User not found" } })
    .input(userSectionParamSchema),
  remove: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/users/{id}/admin-grants/{section}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Grant not found for this user and section" } })
    .input(userSectionParamSchema),
};

export type AdminGrantsContract = typeof adminGrantsContract;
export interface AdminGrantsResponse {
  grants: z.infer<typeof adminGrantSchema>[];
}
