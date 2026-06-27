import { idParamSchema, isoDateTime, withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { slugRegex } from "./shared.js";

const TAG = "Admin - Distribution Channels";

const DC = "/api/admin/v1/distribution-channels";

const channelKindEnum = z.enum(["event", "product"]);

const channelSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  kind: channelKindEnum,
  sortOrder: z.number(),
  parentId: z.string().nullable(),
  childrenLabel: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  printingCount: z.number(),
});

/**
 * oRPC contract for the admin distribution-channels taxonomy CRUD (mounted at
 * `/api/admin/v1/distribution-channels`, admin-gated by the mount). Channels
 * are keyed by their UUID `id` and may nest via `parentId`. Conflict /
 * not-found / has-children / in-use states are thrown as `AppError` and bridged
 * to ORPCErrors in the implementation. `remove` takes an optional `force` query
 * flag that also unlinks the channel from all printings. The static `reorder`
 * path precedes `{id}`.
 */
export const adminDistributionChannelsContract = {
  list: oc
    .route({ method: "GET", path: DC, tags: [TAG] })
    .output(z.object({ distributionChannels: z.array(channelSchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${DC}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ ids: z.array(z.string().min(1)).min(1) })),
  create: oc
    .route({ method: "POST", path: DC, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case (e.g. nexus-night-2025)"),
        label: z.string().min(1),
        description: z.string().min(1).nullable().optional(),
        kind: channelKindEnum.optional(),
        parentId: z.uuid().nullable().optional(),
        childrenLabel: z.string().min(1).nullable().optional(),
      }),
    )
    .output(z.object({ distributionChannel: channelSchema })),
  update: oc.route({ method: "PATCH", path: `${DC}/{id}`, tags: [TAG], successStatus: 204 }).input(
    withParams(idParamSchema, {
      slug: z.string().min(1).regex(slugRegex, "Slug must be kebab-case").optional(),
      label: z.string().min(1).optional(),
      description: z.string().min(1).nullable().optional(),
      kind: channelKindEnum.optional(),
      parentId: z.uuid().nullable().optional(),
      childrenLabel: z.string().min(1).nullable().optional(),
    }),
  ),
  // Detailed input structure: a DELETE's query params aren't read in compact
  // mode, so `force` must come through `query`. `id` stays a path param.
  remove: oc
    .route({
      method: "DELETE",
      path: `${DC}/{id}`,
      tags: [TAG],
      successStatus: 204,
      inputStructure: "detailed",
    })
    .input(
      z.object({
        params: idParamSchema,
        query: z.object({ force: z.enum(["true", "false"]).optional() }),
      }),
    ),
};

export type AdminDistributionChannelsContract = typeof adminDistributionChannelsContract;
export interface AdminDistributionChannelsResponse {
  distributionChannels: z.infer<typeof channelSchema>[];
}
