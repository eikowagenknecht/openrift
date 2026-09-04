import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
  distributionChannelSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

const distributionChannelWithCountSchema = distributionChannelSchema.extend({
  cardCount: z.number().openapi({ example: 12 }),
  printingCount: z.number().openapi({ example: 24 }),
});

export const promosQuerySchema = z.object({
  /** Two-letter printing language. Everything else is filtered out. */
  language: z.string().min(1).max(8).openapi({ example: "EN" }),
});

export const promosListResponseSchema = z
  .object({
    channels: z.array(distributionChannelWithCountSchema),
    cards: z.record(z.string(), catalogCardResponseSchema),
    printings: z.array(catalogPrintingResponseSchema),
    /** Sets referenced by the promo printings, for the set filter and sort axes. */
    sets: z.array(catalogSetResponseSchema),
    /** Every language that has promos, so the page can offer a switcher. */
    languages: z.array(z.string()).openapi({ example: ["EN", "SC"] }),
    // prices are NOT inlined — read them from the /prices resource.
  })
  .openapi("PromosListResponse");

/**
 * oRPC contract for the public promos page.
 * `GET /api/v1/promos?language=EN` — one language's distribution channels
 * (event + product), printings and cards. Edge-cached (ETag via `etag()`).
 * Scoped by language: the unscoped response is large enough to blank SSR.
 */
export const promosContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/promos", tags: ["Promos"] })
    .meta({ auth: "public", cache: "medium", etag: true })
    .input(promosQuerySchema)
    .output(promosListResponseSchema),
};

export type PromosContract = typeof promosContract;
