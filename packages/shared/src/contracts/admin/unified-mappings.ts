import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  unifiedMappingsCardResponseSchema,
  unifiedMappingsResponseSchema,
} from "../../response-schemas.js";
import { marketplaceEnum } from "../../schemas.js";

const TAG = "Admin - Mappings";

const MM = "/api/admin/v1/marketplace-mappings";

const saveMappingsBody = z.object({
  mappings: z.array(
    z.object({
      printingId: z.uuid(),
      externalId: z.number(),
      // The marketplace's own view of the SKU finish — always `normal` / `foil`.
      finish: z.string(),
      // `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG).
      language: z.string().nullable(),
    }),
  ),
});

const saveMappingsResult = z.object({
  saved: z.number(),
  skipped: z.array(z.object({ externalId: z.number(), reason: z.string() })),
});

/**
 * oRPC contract for the admin unified marketplace-mappings (mounted under
 * `/api/admin/v1/marketplace-mappings`, admin-gated by the mount). Reuses the
 * shared response schemas. `save` carries a `marketplace` query alongside its
 * body, and `unmap` addresses the SKU via query params — both use detailed
 * input structure since oRPC compact mode does not read query params on these.
 */
export const adminUnifiedMappingsContract = {
  list: oc.route({ method: "GET", path: MM, tags: [TAG] }).output(unifiedMappingsResponseSchema),
  card: oc
    .route({ method: "GET", path: `${MM}/card/{cardId}`, tags: [TAG] })
    .input(z.object({ cardId: z.string() }))
    .output(unifiedMappingsCardResponseSchema),
  save: oc
    .route({ method: "POST", path: MM, tags: [TAG], inputStructure: "detailed" })
    .input(z.object({ query: z.object({ marketplace: marketplaceEnum }), body: saveMappingsBody }))
    .output(saveMappingsResult),
  unmap: oc
    .route({
      method: "DELETE",
      path: MM,
      tags: [TAG],
      successStatus: 204,
      inputStructure: "detailed",
    })
    .input(
      z.object({
        query: z.object({
          marketplace: marketplaceEnum,
          printingId: z.uuid(),
          externalId: z.coerce.number().int(),
          finish: z.string(),
          language: z.string().optional(),
        }),
      }),
    ),
};

export type AdminUnifiedMappingsContract = typeof adminUnifiedMappingsContract;
export type UnifiedMappingsResponse = z.infer<typeof unifiedMappingsResponseSchema>;
export type UnifiedMappingsCardResponse = z.infer<typeof unifiedMappingsCardResponseSchema>;
