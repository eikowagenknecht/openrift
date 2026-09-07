import { idParamSchema, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { slugRegex } from "./shared.js";

const TAG = "Admin - Distribution Channels";

const DC = "/api/admin/v1/distribution-channels";

export const channelKindEnum = z.enum(["event", "product"]);

export const channelSchema = z.object({
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
 * Admin distribution-channels taxonomy CRUD, mounted at
 * `/api/admin/v1/distribution-channels`. The static `reorder` path must
 * precede `{id}`.
 */
export const adminDistributionChannelsContract = {
  list: authedRoute
    .route({ method: "GET", path: DC, tags: [TAG] })
    .output(z.object({ distributionChannels: z.array(channelSchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${DC}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid or incomplete list of channel ids" } })
    .input(z.object({ ids: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: DC, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "A distribution channel with that slug already exists" } })
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
  update: authedRoute
    .route({ method: "PATCH", path: `${DC}/{id}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Distribution channel not found" },
      CONFLICT: { message: "A distribution channel with that slug already exists" },
    })
    .input(
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
  remove: authedRoute
    .route({
      method: "DELETE",
      path: `${DC}/{id}`,
      tags: [TAG],
      successStatus: 204,
      inputStructure: "detailed",
    })
    .errors({
      NOT_FOUND: { message: "Distribution channel not found" },
      CONFLICT: { message: "Distribution channel has children or is in use by printings" },
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
