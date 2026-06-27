import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  distributionChannelSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

const distributionChannelWithCountSchema = distributionChannelSchema.extend({
  cardCount: z.number().openapi({ example: 12 }),
  printingCount: z.number().openapi({ example: 24 }),
});

export const promosListResponseSchema = z
  .object({
    channels: z.array(distributionChannelWithCountSchema),
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    // prices are NOT inlined — read them from the /prices resource.
  })
  .openapi("PromosListResponse");

/**
 * oRPC contract for the public promos page.
 * `GET /api/v1/promos` — all distribution channels (event + product) with their
 * printings and cards. Edge-cached (ETag via the mount's `etag()`).
 */
export const promosContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/promos", tags: ["Promos"] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .output(promosListResponseSchema),
};

export type PromosContract = typeof promosContract;
