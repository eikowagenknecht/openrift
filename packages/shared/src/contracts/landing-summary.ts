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
    legendThumbnailIds: z.array(z.string()).openapi({
      example: ["019d02f1-d14f-769f-9295-9852db692dbe"],
    }),
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

export const landingSummaryContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/landing-summary", tags: ["Catalog"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .output(landingSummaryResponseSchema),
};

export type LandingSummaryContract = typeof landingSummaryContract;
