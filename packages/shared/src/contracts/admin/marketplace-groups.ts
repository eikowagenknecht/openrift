import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Marketplace Groups";

const MG = "/api/admin/v1/marketplace-groups";

const groupKindEnum = z.enum(["basic", "special"]);

const marketplaceGroupSchema = z.object({
  marketplace: z.string(),
  groupId: z.number(),
  name: z.string().nullable(),
  abbreviation: z.string().nullable(),
  groupKind: groupKindEnum,
  setId: z.uuid().nullable(),
  stagedCount: z.number(),
  assignedCount: z.number(),
});

/**
 * oRPC contract for the admin marketplace-groups (mounted under
 * `/api/admin/v1/marketplace-groups`, admin-gated by the mount). All
 * procedures share the `authedRoute` base (UNAUTHORIZED + FORBIDDEN). Groups
 * are keyed by the `{marketplace}/{id}` pair (`id` is the numeric upstream
 * group id). `update` is a partial patch (at least one field). Domain codes
 * per route: `update` → NOT_FOUND.
 */
export const adminMarketplaceGroupsContract = {
  list: authedRoute
    .route({ method: "GET", path: MG, tags: [TAG] })
    .output(z.object({ groups: z.array(marketplaceGroupSchema) })),
  update: authedRoute
    .route({ method: "PATCH", path: `${MG}/{marketplace}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Marketplace group not found" } })
    .input(
      z
        .object({
          marketplace: z.string().min(1),
          id: z.coerce.number().int(),
          name: z.string().nullable().optional(),
          groupKind: groupKindEnum.optional(),
          setId: z.uuid().nullable().optional(),
        })
        .refine((o) => o.name !== undefined || o.groupKind !== undefined || o.setId !== undefined, {
          message: "At least one field (name, groupKind, setId) must be provided",
        }),
    ),
};

export type AdminMarketplaceGroupsContract = typeof adminMarketplaceGroupsContract;
export interface MarketplaceGroupsResponse {
  groups: z.infer<typeof marketplaceGroupSchema>[];
}
export type MarketplaceGroup = z.infer<typeof marketplaceGroupSchema>;
