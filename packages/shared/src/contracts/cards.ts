import { oc } from "@orpc/contract";
import { z } from "zod";

import { cardDetailResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public card-detail endpoint.
 * `GET /api/v1/cards/{cardSlug}` — a single card with all printings + their
 * sets (SSR-friendly; prices are served separately). Typed NOT_FOUND for an
 * unknown slug.
 */
export const cardsContract = {
  detail: oc
    .route({ method: "GET", path: "/api/v1/cards/{cardSlug}", tags: ["Cards"] })
    .meta({ auth: "public" })
    .input(z.object({ cardSlug: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Card not found" } })
    .output(cardDetailResponseSchema),
};

export type CardsContract = typeof cardsContract;
