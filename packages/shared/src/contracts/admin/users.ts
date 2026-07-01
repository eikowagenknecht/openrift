import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Users";

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  isAdmin: z.boolean(),
  cardCount: z.number(),
  deckCount: z.number(),
  collectionCount: z.number(),
  listCount: z.number(),
  createdAt: isoDateTime,
  lastActiveAt: isoDateTime.nullable(),
});

/**
 * oRPC contract for the admin users list (mounted at `/api/admin/v1/users`,
 * admin-gated by the mount). Read-only: every user with aggregate counts.
 * Session-gated (UNAUTHORIZED + FORBIDDEN from `authedRoute`); no domain error
 * codes are declared.
 */
export const adminUsersContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/admin/v1/users", tags: [TAG] })
    .output(z.object({ users: z.array(adminUserSchema) })),
};

export type AdminUsersContract = typeof adminUsersContract;
export interface AdminUsersResponse {
  users: z.infer<typeof adminUserSchema>[];
}
