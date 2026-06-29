import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { deckCheckClaimTokenParamSchema } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const deckCheckClaimLandingResponseSchema = z
  .object({
    tournamentId: z.string(),
    tournamentName: z.string(),
    startsAt: z.string(),
    hostName: z.string(),
    hostType: z.enum(["user", "organization"]),
    groupName: z.string().nullable(),
    deckSubmission: z.enum(["none", "optional", "required"]),
    participantName: z.string(),
  })
  .openapi("DeckCheckClaimLandingResponse");

/**
 * oRPC contract for the public tournament claim landing (ADR-026, ADR-033).
 * `GET /api/v1/deck-check/claim/{token}` — pre-claim landing for a participant
 * claim link; reveals the tournament (name, start, organizer, owning group, and
 * whether decks are submitted) and the spot's name, never the deck. Works with
 * or without deck check. Typed NOT_FOUND for an unknown token. The matching claim
 * POST stays in the authenticated player app.
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
