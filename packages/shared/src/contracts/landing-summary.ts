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
    // Same sample as thumbnailIds, carrying each printing's identity so the
    // marketing vignettes can label the card they show. The ids stay as their
    // own field so bundles from before this field keep working against the
    // edge-cached payload.
    thumbnails: z
      .array(
        z.object({
          imageId: z.string(),
          rarity: z.string(),
          domains: z.array(z.string()),
          name: z.string(),
          shortCode: z.string(),
          variantLabel: z.string().nullable(),
          priceCents: z.number().nullable(),
        }),
      )
      .openapi({
        example: [
          {
            imageId: "019d02f1-d14f-769f-9295-9852db692dbe",
            rarity: "epic",
            domains: ["fury"],
            name: "Jinx, Rebel",
            shortCode: "OGN-202",
            variantLabel: null,
            priceCents: 420,
          },
        ],
      }),
    // Real distribution channels for the promos vignette, so the miniature's
    // "Promo" chips sit on printings that were actually handed out that way.
    promoSections: z
      .array(
        z.object({
          path: z.array(z.string()),
          printingCount: z.number(),
          printings: z.array(
            z.object({
              imageId: z.string(),
              name: z.string(),
              shortCode: z.string(),
              rarity: z.string(),
              markers: z.array(z.string()),
            }),
          ),
        }),
      )
      .openapi({
        example: [
          {
            path: ["Nexus Night", "Spiritforged"],
            printingCount: 40,
            printings: [
              {
                imageId: "019d02f1-d14f-769f-9295-9852db692dbe",
                name: "Navori Scout",
                shortCode: "SFD-037",
                rarity: "common",
                markers: ["Promo"],
              },
            ],
          },
        ],
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
    .meta({ auth: "public", cache: "long", etag: true })
    .output(landingSummaryResponseSchema),
};

export type LandingSummaryContract = typeof landingSummaryContract;
