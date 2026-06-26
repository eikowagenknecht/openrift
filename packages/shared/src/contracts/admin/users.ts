import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Users";

const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  isAdmin: z.boolean(),
  cardCount: z.number(),
  deckCount: z.number(),
  collectionCount: z.number(),
  listCount: z.number(),
  createdAt: z.string(),
  lastActiveAt: z.string().nullable(),
});

/**
 * oRPC contract for the admin users list (mounted at `/api/admin/v1/users`,
 * admin-gated by the mount). Read-only: every user with aggregate counts.
 */
export const adminUsersContract = {
  list: oc
    .route({ method: "GET", path: "/api/admin/v1/users", tags: [TAG] })
    .output(z.object({ users: z.array(adminUserSchema) })),
};

export type AdminUsersContract = typeof adminUsersContract;
export interface AdminUsersResponse {
  users: z.infer<typeof adminUserSchema>[];
}
