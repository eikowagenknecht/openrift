import { oc } from "@orpc/contract";
import { z } from "zod";

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
 * `/api/admin/v1/marketplace-groups`, admin-gated by the mount). Groups are
 * keyed by the `{marketplace}/{id}` pair (`id` is the numeric upstream group
 * id). `update` is a partial patch (at least one field). Not-found is thrown as
 * `AppError` and bridged to an ORPCError in the implementation.
 */
export const adminMarketplaceGroupsContract = {
  list: oc
    .route({ method: "GET", path: MG, tags: [TAG] })
    .output(z.object({ groups: z.array(marketplaceGroupSchema) })),
  update: oc
    .route({ method: "PATCH", path: `${MG}/{marketplace}/{id}`, tags: [TAG], successStatus: 204 })
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
