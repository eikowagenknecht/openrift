import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  catalogCardResponseSchema,
  catalogPrintingResponseSchema,
  catalogSetResponseSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const cardDetailResponseSchema = z
  .object({
    card: catalogCardResponseSchema,
    printings: z.array(catalogPrintingResponseSchema),
    sets: z.array(catalogSetResponseSchema),
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
