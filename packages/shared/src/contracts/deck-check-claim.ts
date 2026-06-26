import { oc } from "@orpc/contract";

import { deckCheckClaimLandingResponseSchema } from "../response-schemas.js";
import { deckCheckClaimTokenParamSchema } from "../schemas.js";

/**
 * oRPC contract for the public deck-check claim landing (ADR-026).
 * `GET /api/v1/deck-check/claim/{token}` — pre-claim landing for a provider
 * link; reveals only the event + owning group. Typed NOT_FOUND for an unknown
 * token. The matching claim POST stays in the authenticated player app.
 */
export const deckCheckClaimContract = {
  landing: oc
    .route({ method: "GET", path: "/api/v1/deck-check/claim/{token}", tags: ["Deck Check"] })
    .meta({ auth: "public" })
    .input(deckCheckClaimTokenParamSchema)
    .errors({ NOT_FOUND: { message: "Claim link not found" } })
    .output(deckCheckClaimLandingResponseSchema),
};

export type DeckCheckClaimContract = typeof deckCheckClaimContract;
