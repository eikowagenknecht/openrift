import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const landingSummaryResponseSchema = z
  .object({
    cardCount: z.number().openapi({ example: 312 }),
    printingCount: z.number().openapi({ example: 468 }),
    copyCount: z.number().openapi({ example: 142 }),
    thumbnailIds: z.array(z.string()).openapi({
      example: ["019d02f1-d14f-769f-9295-9852db692dbe"],
    }),
  })
  .openapi("LandingSummaryResponse");

/**
 * oRPC contract for the public landing-summary endpoint.
 *
 * `GET /api/v1/landing-summary` — the lightweight hero payload (counts + a
 * per-day-stable thumbnail sample). Edge-cached; the ETag is produced by the
 * Hono `etag()` middleware around the mounted handler, not by the contract.
 */
export const landingSummaryContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/landing-summary", tags: ["Catalog"] })
    .meta({ auth: "public" })
    .output(landingSummaryResponseSchema),
};

export type LandingSummaryContract = typeof landingSummaryContract;
