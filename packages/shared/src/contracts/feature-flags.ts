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

/**
 * oRPC contract for the public feature-flags endpoint.
 *
 * Contract-first: this value is the single source of truth for the route's
 * method, path, and response shape. The API implements it (`implement()` in
 * `apps/api/src/routes/public/feature-flags.ts`) and the web client builds its
 * typed `OpenAPILink` from the same value. Keeping the path fully-qualified
 * (`/api/v1/...`) means the OpenAPI handler matches the incoming request URL
 * directly and the client composes `baseUrl + path` without a mount prefix.
 */
export const featureFlagsContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/feature-flags", tags: ["Feature Flags"] })
    .meta({ auth: "public" })
    .output(featureFlagsResponseSchema),
};

export type FeatureFlagsContract = typeof featureFlagsContract;
