import { oc } from "@orpc/contract";
import { z } from "zod";

import { publicDeckDetailResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public (share-token) deck view.
 * `GET /api/v1/decks/share/{token}` — anonymous, denormalized view of a shared
 * deck, or a typed NOT_FOUND for an unknown / non-public token.
 */
export const publicDecksContract = {
  share: oc
    .route({ method: "GET", path: "/api/v1/decks/share/{token}", tags: ["Decks"] })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicDeckDetailResponseSchema),
};

export type PublicDecksContract = typeof publicDecksContract;
