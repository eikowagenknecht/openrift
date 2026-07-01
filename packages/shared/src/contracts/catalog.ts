import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

// Wire-only shapes for /catalog: identity lives in the map key, not the value.
export const catalogCardResponseValueSchema = catalogCardResponseSchema.omit({ id: true });

export const catalogPrintingResponseValueSchema = catalogPrintingResponseSchema.omit({ id: true });

export const catalogResponseSchema = z
  .object({
    sets: z.array(catalogSetResponseSchema),
    cards: z.record(z.string(), catalogCardResponseValueSchema),
    printings: z.record(z.string(), catalogPrintingResponseValueSchema),
    totalCopies: z.number().openapi({ example: 142 }),
    /**
     * Map of card id → array of custom-tag slugs (sorted). Admin-curated
     * tags supplementing the catalogue's intrinsic data; consumed only by
     * custom deck-builder formats (e.g. region-locked freeform). Standard
     * UI should not render these alongside `card.tags`.
     */
    customTagAssignments: z.record(z.string(), z.array(z.string())).openapi({ example: {} }),
  })
  .openapi("CatalogResponse");

/**
 * oRPC contract for the public card catalog (`GET /api/v1/catalog`). The `v`
 * query param is a cache-buster the web appends (the catalog's current ETag) so
 * a content change rolls the edge-cache URL; the handler ignores it. Long-lived
 * edge cache + ETag are applied by the mount's Hono `etag()` middleware.
 */
export const catalogContract = {
  catalog: oc
    .route({ method: "GET", path: "/api/v1/catalog", tags: ["Catalog"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(z.object({ v: z.string().optional() }))
    .output(catalogResponseSchema),
};

export type CatalogContract = typeof catalogContract;
