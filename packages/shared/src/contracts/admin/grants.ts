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
 * oRPC contract for per-section admin grants (mounted under `/api/admin/v1`,
 * admin-gated by the mount). These management endpoints are reachable by full
 * admins only — the gate lets grant holders through solely to their granted
 * section's paths, which never include this surface. Domain codes per route:
 * `add` → NOT_FOUND (unknown user); `remove` → NOT_FOUND (no such grant).
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
