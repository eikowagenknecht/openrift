import { oc } from "@orpc/contract";
import { z } from "zod";

import { marketplaceEnum } from "../../schemas.js";

const TAG = "Admin - Staging";

const SCO = "/api/admin/v1/staging-card-overrides";

/**
 * oRPC contract for the admin staging-card-overrides (mounted at
 * `/api/admin/v1/staging-card-overrides`, admin-gated by the mount). `create`
 * upserts an override by its product SKU; `remove` addresses it via query
 * params. The DELETE uses detailed input structure because oRPC compact mode
 * does not read query params on a DELETE.
 */
export const adminStagingCardOverridesContract = {
  create: oc.route({ method: "POST", path: SCO, tags: [TAG], successStatus: 204 }).input(
    z.object({
      marketplace: marketplaceEnum,
      externalId: z.number(),
      finish: z.string(),
      language: z.string().nullable(),
      cardId: z.uuid(),
    }),
  ),
  remove: oc
    .route({
      method: "DELETE",
      path: SCO,
      tags: [TAG],
      successStatus: 204,
      inputStructure: "detailed",
    })
    .input(
      z.object({
        query: z.object({
          marketplace: marketplaceEnum,
          externalId: z.coerce.number(),
          finish: z.string(),
          language: z.string().optional(),
        }),
      }),
    ),
};

export type AdminStagingCardOverridesContract = typeof adminStagingCardOverridesContract;
