import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  cardTypeSchema,
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
  domainSchema,
  raritySchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

/**
 * One product containing one printing of this card (ADR-015). Kept as a
 * card-detail-only field rather than a member of
 * `catalogPrintingResponseSchema`: that schema also backs the synced catalog,
 * /promos, and /sets, and product membership is neither catalog data nor
 * wanted on those surfaces.
 */
export const cardDetailProductSchema = z
  .object({
    printingId: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
    slug: z.string().openapi({ example: "sfd-prerift-ezreal" }),
    name: z.string().openapi({ example: "SFD Pre-Rift Kit - Ezreal" }),
    quantity: z.number().int().positive().openapi({ example: 2 }),
  })
  .openapi("CardDetailProduct");

/**
 * One entry in the card page's "Related cards" strip: just enough for a
 * thumbnail link (`types`/`domains`/`rarity` drive the art frame). `rarity`
 * and `imageId` are null for a card with no usable printing art.
 */
export const cardDetailRelatedCardSchema = z
  .object({
    slug: z.string().openapi({ example: "yasuo-windrider" }),
    name: z.string().openapi({ example: "Yasuo, Windrider" }),
    types: z.array(cardTypeSchema).openapi({ example: ["Unit"] }),
    domains: z.array(domainSchema).openapi({ example: ["Calm"] }),
    rarity: raritySchema.nullable(),
    imageId: z.string().nullable().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
  })
  .openapi("CardDetailRelatedCard");

export const cardDetailResponseSchema = z
  .object({
    card: catalogCardResponseSchema,
    printings: z.array(catalogPrintingResponseSchema),
    sets: z.array(catalogSetResponseSchema),
    // Product membership per printing, flat (one row per printing+product).
    // The web groups by `printingId` for the selected printing's "Found in" row.
    products: z.array(cardDetailProductSchema).openapi({ example: [] }),
    related: z.array(cardDetailRelatedCardSchema).openapi({ example: [] }),
    // prices are NOT inlined — read them from the /prices resource.
  })
  .openapi("CardDetailResponse");

/**
 * oRPC contract for the public card-detail endpoint.
 * `GET /api/v1/cards/{cardSlug}` — a single card with all printings + their
 * sets (SSR-friendly; prices are served separately). Typed NOT_FOUND for an
 * unknown slug.
 */
export const cardsContract = {
  detail: oc
    .route({ method: "GET", path: "/api/v1/cards/{cardSlug}", tags: ["Cards"] })
    .meta({ auth: "public", cache: "long", etag: true })
    .input(z.object({ cardSlug: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Card not found" } })
    .output(cardDetailResponseSchema),
};

export type CardsContract = typeof cardsContract;
