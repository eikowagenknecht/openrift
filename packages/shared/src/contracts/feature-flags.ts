import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const featureFlagsResponseSchema = z
  .object({
    flags: z.record(z.string(), z.boolean()).openapi({
      example: { collection: true, decks: true },
    }),
  })
  .openapi("FeatureFlagsResponse");

export const featureFlagsContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/feature-flags", tags: ["Feature Flags"] })
    .meta({ auth: "public", cache: "short", cacheVary: "viewer" })
    .output(featureFlagsResponseSchema),
};

export type FeatureFlagsContract = typeof featureFlagsContract;
